import {
	IDataObject,
	IHttpRequestMethods,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from "n8n-workflow";

interface PaymentRequirements {
	scheme: string;
	network: string;
	maxAmountRequired: string;
	resource: string;
	description: string;
	mimeType: string;
	payTo: string;
	maxTimeoutSeconds: number;
}

interface FacilitatorResponse {
	valid: boolean;
	invalidReason?: string;
	[key: string]: unknown;
}

export class X402Trigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: "x402 Trigger",
		name: "x402Trigger",
		icon: "file:x402.svg",
		group: ["trigger"],
		version: 1,
		subtitle: '={{$parameter["network"] + " — $" + $parameter["price"]}}',
		description:
			"Webhook trigger that accepts x402 micropayments — returns 402 for unpaid requests and settles paid ones",
		defaults: {
			name: "x402 Trigger",
		},
		inputs: [],
		outputs: ["main"],
		credentials: [
			{
				name: "x402Api",
				required: true,
			},
		],
		webhooks: [
			{
				name: "default",
				httpMethod: "={{$parameter.httpMethod}}",
				responseMode: "onReceived",
				path: "={{$parameter.path}}",
				isFullPath: false,
			},
		],
		properties: [
			{
				displayName: "HTTP Method",
				name: "httpMethod",
				type: "options",
				options: [
					{ name: "GET", value: "GET" },
					{ name: "POST", value: "POST" },
				],
				default: "GET",
				description: "HTTP method this webhook listens on",
			},
			{
				displayName: "Path",
				name: "path",
				type: "string",
				default: "x402-webhook",
				required: true,
				description: "Webhook URL path (appended to the base webhook URL)",
			},
			{
				displayName: "Price (USD)",
				name: "price",
				type: "string",
				default: "0.01",
				required: true,
				description: "Price in USD to charge per request",
			},
			{
				displayName: "Token",
				name: "token",
				type: "options",
				options: [{ name: "USDC", value: "USDC" }],
				default: "USDC",
				description: "Payment token to accept",
			},
			{
				displayName: "Network",
				name: "network",
				type: "options",
				options: [
					{ name: "Base", value: "base" },
					{ name: "Base Sepolia (Testnet)", value: "base-sepolia" },
					{ name: "Solana", value: "solana" },
					{ name: "Solana Devnet", value: "solana-devnet" },
				],
				default: "base-sepolia",
				description: "Blockchain network for payment settlement",
			},
			{
				displayName: "Description",
				name: "resourceDescription",
				type: "string",
				default: "x402-protected resource",
				description: "Human-readable description of the resource being sold",
			},
			{
				displayName: "Max Timeout (Seconds)",
				name: "maxTimeoutSeconds",
				type: "number",
				default: 60,
				description: "Maximum time in seconds the payment is valid for",
			},
		],
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const res = this.getResponseObject();

		const credentials = await this.getCredentials("x402Api");
		const facilitatorUrl = credentials.facilitatorUrl as string;
		const receiverAddress = credentials.receiverAddress as string;

		const price = this.getNodeParameter("price") as string;
		const token = this.getNodeParameter("token") as string;
		const network = this.getNodeParameter("network") as string;
		const resourceDescription = this.getNodeParameter(
			"resourceDescription",
		) as string;
		const maxTimeoutSeconds = this.getNodeParameter(
			"maxTimeoutSeconds",
		) as number;

		// Build payment requirements
		const webhookUrl = this.getNodeWebhookUrl("default") as string;
		const paymentRequirements: PaymentRequirements = {
			scheme: "exact",
			network,
			maxAmountRequired: price,
			resource: webhookUrl,
			description: resourceDescription,
			mimeType: "application/json",
			payTo: receiverAddress,
			maxTimeoutSeconds,
		};

		// Check for payment header (case-insensitive via lowercase)
		const paymentHeader = req.headers["x-402-payment"] as string | undefined;

		if (!paymentHeader) {
			// No payment — return 402 with requirements
			const requirementsBase64 = Buffer.from(
				JSON.stringify(paymentRequirements),
			).toString("base64");

			res.status(402);
			res.setHeader("x-402-payment-required", requirementsBase64);
			res.setHeader("Content-Type", "application/json");
			res.json({
				error: "Payment Required",
				accepts: [
					{
						scheme: "exact",
						network,
						maxAmountRequired: price,
						token,
						payTo: receiverAddress,
						maxTimeoutSeconds,
					},
				],
			});

			return { noWebhookResponse: true };
		}

		// Payment present — decode and verify with facilitator
		let payload: IDataObject;
		try {
			const decoded = Buffer.from(paymentHeader, "base64").toString("utf-8");
			payload = JSON.parse(decoded) as IDataObject;
		} catch (_error) {
			res.status(400);
			res.json({
				error: "Invalid payment header — expected base64-encoded JSON",
			});
			return { noWebhookResponse: true };
		}

		// Verify payment with facilitator
		let verifyResponse: FacilitatorResponse;
		try {
			const verifyResult = await this.helpers.httpRequest({
				method: "POST" as IHttpRequestMethods,
				url: `${facilitatorUrl}/verify`,
				body: {
					payload,
					paymentRequirements,
				},
				headers: { "Content-Type": "application/json" },
				returnFullResponse: false,
			});
			verifyResponse = verifyResult as FacilitatorResponse;
		} catch (error) {
			res.status(502);
			res.json({
				error: "Payment verification failed",
				details:
					error instanceof Error ? error.message : String(error),
			});
			return { noWebhookResponse: true };
		}

		if (!verifyResponse.valid) {
			res.status(402);
			res.json({
				error: "Payment invalid",
				reason:
					verifyResponse.invalidReason ??
					"Facilitator rejected payment",
			});
			return { noWebhookResponse: true };
		}

		// Settle payment with facilitator
		let settleResponse: IDataObject;
		try {
			const settleResult = await this.helpers.httpRequest({
				method: "POST" as IHttpRequestMethods,
				url: `${facilitatorUrl}/settle`,
				body: {
					payload,
					paymentRequirements,
				},
				headers: { "Content-Type": "application/json" },
				returnFullResponse: false,
			});
			settleResponse = settleResult as IDataObject;
		} catch (error) {
			res.status(502);
			res.json({
				error: "Payment settlement failed",
				details:
					error instanceof Error ? error.message : String(error),
			});
			return { noWebhookResponse: true };
		}

		// Payment verified and settled — pass data to workflow
		const body = req.body as IDataObject;
		const query = req.query as IDataObject;
		const headers = req.headers as unknown as IDataObject;

		return {
			workflowData: [
				this.helpers.returnJsonArray({
					body,
					query,
					headers,
					payment: {
						payload,
						verified: true,
						settled: true,
						settlementResponse: settleResponse,
						network,
						token,
						amount: price,
						paidBy: (payload.from as string) ?? "unknown",
					},
				}),
			],
		};
	}
}
