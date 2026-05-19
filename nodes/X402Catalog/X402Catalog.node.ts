import {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from "n8n-workflow";

export class X402Catalog implements INodeType {
	description: INodeTypeDescription = {
		displayName: "x402 Catalog",
		name: "x402Catalog",
		icon: "file:x402.svg",
		group: ["transform"],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description:
			"Query the SmartFlow Observatory x402 endpoint catalogue — 58k+ endpoints, queryable by URL, registry source, chain, status, spec-validity, on-chain volume, and recent activity.",
		defaults: {
			name: "x402 Catalog",
		},
		inputs: ["main"],
		outputs: ["main"],
		credentials: [
			{
				name: "smartFlowMapperApi",
				required: true,
			},
		],
		properties: [
			{
				displayName: "Operation",
				name: "operation",
				type: "options",
				noDataExpression: true,
				options: [
					{
						name: "Get Catalog Stats",
						value: "getStats",
						description: "Return total catalogue size and per-source counts",
						action: "Get catalog stats",
					},
					{
						name: "List Endpoints",
						value: "listEndpoints",
						description: "List endpoints with optional filters",
						action: "List endpoints",
					},
					{
						name: "Search Endpoints",
						value: "searchEndpoints",
						description: "Full-text search across endpoint URLs",
						action: "Search endpoints",
					},
					{
						name: "Get Endpoint Details",
						value: "getEndpointDetails",
						description: "Get full record for a single endpoint by URL",
						action: "Get endpoint details",
					},
					{
						name: "Get Active Endpoints",
						value: "getActiveEndpoints",
						description:
							"List endpoints active within a recent time window (v0.3.0)",
						action: "Get active endpoints",
					},
				],
				default: "getStats",
			},

			// --- listEndpoints filters ---
			{
				displayName: "Chain",
				name: "chain",
				type: "string",
				default: "",
				placeholder: "base-mainnet",
				description:
					'Filter by chain (e.g. "base-mainnet", "solana-mainnet", "eip155:1"). Leave empty for all chains.',
				displayOptions: {
					show: { operation: ["listEndpoints"] },
				},
			},
			{
				displayName: "Source",
				name: "source",
				type: "string",
				default: "",
				placeholder: "x402scan",
				description:
					'Filter by registry source (e.g. "x402scan", "well-known-discovery", "bazaar-merge"). Leave empty for all sources.',
				displayOptions: {
					show: { operation: ["listEndpoints"] },
				},
			},
			{
				displayName: "HTTP Status",
				name: "status",
				type: "number",
				default: 0,
				placeholder: "402",
				description:
					"Filter by last HTTP probe status (e.g. 402, 200). Use 0 to skip filter.",
				displayOptions: {
					show: { operation: ["listEndpoints"] },
				},
			},
			{
				displayName: 'Strict V2 Spec Valid',
				name: "specValid",
				type: "options",
				options: [
					{ name: "Any", value: -1 },
					{ name: "Valid only (1)", value: 1 },
					{ name: "Invalid only (0)", value: 0 },
				],
				default: -1,
				description:
					"Filter by strict x402 v2 schema validity flag. Use Any to skip filter.",
				displayOptions: {
					show: { operation: ["listEndpoints"] },
				},
			},
			{
				displayName: "Min On-Chain Volume USDC",
				name: "volumeGt",
				type: "number",
				default: 0,
				placeholder: "0",
				description:
					"Filter to endpoints with on_chain_volume_usdc > X (v0.3.0). Use 0 to skip filter.",
				displayOptions: {
					show: { operation: ["listEndpoints"] },
				},
				typeOptions: { minValue: 0 },
			},
			{
				displayName: "Limit",
				name: "limit",
				type: "number",
				default: 50,
				typeOptions: { minValue: 1, maxValue: 500 },
				description: 'Max number of results to return',
				displayOptions: {
					show: { operation: ["listEndpoints", "searchEndpoints", "getActiveEndpoints"] },
				},
			},
			{
				displayName: "Offset",
				name: "offset",
				type: "number",
				default: 0,
				typeOptions: { minValue: 0 },
				description: 'Pagination offset',
				displayOptions: {
					show: { operation: ["listEndpoints"] },
				},
			},

			// --- searchEndpoints ---
			{
				displayName: "Search Query",
				name: "query",
				type: "string",
				default: "",
				required: true,
				placeholder: "weather",
				description: 'Substring to match against endpoint URLs',
				displayOptions: {
					show: { operation: ["searchEndpoints"] },
				},
			},

			// --- getEndpointDetails ---
			{
				displayName: "Endpoint URL",
				name: "endpointUrl",
				type: "string",
				default: "",
				required: true,
				placeholder: "https://api.example.com/x402-resource",
				description: 'Full URL of the endpoint to look up',
				displayOptions: {
					show: { operation: ["getEndpointDetails"] },
				},
			},

			// --- getActiveEndpoints ---
			{
				displayName: "Window (Days)",
				name: "windowDays",
				type: "number",
				default: 7,
				typeOptions: { minValue: 1, maxValue: 90 },
				description:
					"Look-back window in days for last_seen (1-90). v0.3.0 endpoint.",
				displayOptions: {
					show: { operation: ["getActiveEndpoints"] },
				},
			},
		],
		usableAsTool: true,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const credentials = (await this.getCredentials(
			"smartFlowMapperApi",
		)) as IDataObject;
		const baseUrl = (credentials.baseUrl as string).replace(/\/$/, "");

		for (let i = 0; i < items.length; i++) {
			const operation = this.getNodeParameter("operation", i) as string;

			let path = "";
			const query: IDataObject = {};

			if (operation === "getStats") {
				path = "/v1/stats";
			} else if (operation === "listEndpoints") {
				path = "/v1/endpoints";
				const chain = this.getNodeParameter("chain", i, "") as string;
				const source = this.getNodeParameter("source", i, "") as string;
				const status = this.getNodeParameter("status", i, 0) as number;
				const specValid = this.getNodeParameter("specValid", i, -1) as number;
				const volumeGt = this.getNodeParameter("volumeGt", i, 0) as number;
				const limit = this.getNodeParameter("limit", i, 100) as number;
				const offset = this.getNodeParameter("offset", i, 0) as number;

				if (chain) query.chain = chain;
				if (source) query.source = source;
				if (status > 0) query.status = status;
				if (specValid >= 0) query.spec_valid = specValid;
				if (volumeGt > 0) query.volume_gt = volumeGt;
				query.limit = limit;
				query.offset = offset;
			} else if (operation === "searchEndpoints") {
				path = "/v1/endpoints/search";
				query.q = this.getNodeParameter("query", i) as string;
				query.limit = this.getNodeParameter("limit", i, 100) as number;
			} else if (operation === "getEndpointDetails") {
				const url = this.getNodeParameter("endpointUrl", i) as string;
				const urlB64 = Buffer.from(url, "utf-8").toString("base64url");
				path = `/v1/endpoints/${urlB64}`;
			} else if (operation === "getActiveEndpoints") {
				path = "/v1/endpoints/active";
				query.window_days = this.getNodeParameter("windowDays", i, 7) as number;
				query.limit = this.getNodeParameter("limit", i, 100) as number;
			}

			const response = (await this.helpers.httpRequestWithAuthentication.call(
				this,
				"smartFlowMapperApi",
				{
					method: "GET" as IHttpRequestMethods,
					url: `${baseUrl}${path}`,
					qs: query,
					json: true,
				},
			)) as IDataObject;

			returnData.push({
				json: response,
				pairedItem: { item: i },
			});
		}

		return [returnData];
	}
}
