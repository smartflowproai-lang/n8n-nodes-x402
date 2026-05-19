import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from "n8n-workflow";

export class SmartFlowMapperApi implements ICredentialType {
	icon = { light: "file:x402.svg", dark: "file:x402.svg" };
	name = "smartFlowMapperApi";
	displayName = "SmartFlow Mapper API";
	documentationUrl = "https://smartflowproai.com/catalog";

	properties: INodeProperties[] = [
		{
			displayName: "API Key",
			name: "apiKey",
			type: "string",
			typeOptions: { password: true },
			default: "",
			required: true,
			description:
				"SmartFlow Observatory mapper API key. Get one at https://smartflowproai.com/catalog (Hypersub Insider tier — 15 USDC/mo).",
		},
		{
			displayName: "Base URL",
			name: "baseUrl",
			type: "string",
			default: "https://api.smartflowproai.com",
			required: true,
			description: "Base URL of the SmartFlow mapper API.",
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: "generic",
		properties: {
			headers: {
				"X-API-Key": "={{$credentials.apiKey}}",
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: "={{$credentials.baseUrl}}",
			url: "/v1/stats",
			method: "GET",
		},
	};
}
