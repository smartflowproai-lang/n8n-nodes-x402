import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from "n8n-workflow";

export class X402Api implements ICredentialType {
	name = "x402Api";
	displayName = "x402 API";
	documentationUrl = "https://www.x402.org/";

	properties: INodeProperties[] = [
		{
			displayName: "Wallet Private Key",
			name: "walletPrivateKey",
			type: "string",
			typeOptions: { password: true },
			default: "",
			required: true,
			description:
				"Private key of the wallet used to sign x402 payments (hex string, with or without 0x prefix)",
		},
		{
			displayName: "Facilitator URL",
			name: "facilitatorUrl",
			type: "string",
			default: "https://x402.org/facilitator",
			required: true,
			description:
				"URL of the x402 facilitator service for payment verification and settlement",
		},
		{
			displayName: "Receiver Address",
			name: "receiverAddress",
			type: "string",
			default: "",
			description:
				"Wallet address to receive payments (used by the X402 Trigger node)",
		},
	];

	// x402 does not use standard API key auth — payments are signed per-request.
	authenticate: IAuthenticateGeneric = {
		type: "generic",
		properties: {},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: "={{$credentials.facilitatorUrl}}",
			url: "/",
			method: "GET",
		},
	};
}
