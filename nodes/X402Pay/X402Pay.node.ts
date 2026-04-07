import {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from "n8n-workflow";

import * as crypto from "crypto";

interface PaymentRequirement {
	scheme: string;
	network: string;
	maxAmountRequired: string;
	resource: string;
	description?: string;
	mimeType?: string;
	payTo: string;
	maxTimeoutSeconds?: number;
}

export class X402Pay implements INodeType {
	description: INodeTypeDescription = {
		displayName: "x402 Pay",
		name: "x402Pay",
		icon: "file:x402.svg",
		group: ["transform"],
		version: 1,
		subtitle: '={{$parameter["method"] + " " + $parameter["url"]}}',
		description:
			"Make an HTTP request to an x402-protected endpoint — automatically handles 402 payment flow",
		defaults: {
			name: "x402 Pay",
		},
		inputs: ["main"],
		outputs: ["main"],
		credentials: [
			{
				name: "x402Api",
				required: true,
			},
		],
		properties: [
			{
				displayName: "URL",
				name: "url",
				type: "string",
				default: "",
				required: true,
				placeholder: "https://api.example.com/data",
				description: "The x402-protected endpoint URL to call",
			},
			{
				displayName: "Method",
				name: "method",
				type: "options",
				options: [
					{ name: "GET", value: "GET" },
					{ name: "POST", value: "POST" },
				],
				default: "GET",
				description: "HTTP method for the request",
			},
			{
				displayName: "Request Body (JSON)",
				name: "body",
				type: "json",
				default: "{}",
				required: false,
				displayOptions: {
					show: {
						method: ["POST"],
					},
				},
				description: "JSON body to send with the POST request",
			},
			{
				displayName: "Additional Headers",
				name: "additionalHeaders",
				type: "fixedCollection",
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				options: [
					{
						name: "header",
						displayName: "Header",
						values: [
							{
								displayName: "Name",
								name: "name",
								type: "string",
								default: "",
							},
							{
								displayName: "Value",
								name: "value",
								type: "string",
								default: "",
							},
						],
					},
				],
				description: "Additional HTTP headers to include in the request",
			},
			{
				displayName: "Max Retries",
				name: "maxRetries",
				type: "number",
				default: 1,
				description:
					"Maximum number of times to retry the payment flow if it fails",
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			const url = this.getNodeParameter("url", i) as string;
			const method = this.getNodeParameter("method", i) as string;
			const maxRetries = this.getNodeParameter("maxRetries", i) as number;

			const credentials = await this.getCredentials("x402Api");
			const walletPrivateKey = credentials.walletPrivateKey as string;
			const facilitatorUrl = credentials.facilitatorUrl as string;

			// Build additional headers
			const extraHeaders: Record<string, string> = {};
			const additionalHeaders = this.getNodeParameter(
				"additionalHeaders",
				i,
				{},
			) as IDataObject;
			if (additionalHeaders.header) {
				const headers = additionalHeaders.header as IDataObject[];
				for (const h of headers) {
					extraHeaders[h.name as string] = h.value as string;
				}
			}

			let requestBody: IDataObject | undefined;
			if (method === "POST") {
				const bodyStr = this.getNodeParameter("body", i, "{}") as string;
				try {
					requestBody = JSON.parse(bodyStr) as IDataObject;
				} catch (_parseError) {
					throw new Error(
						`Item ${i}: Invalid JSON in request body — check your JSON syntax`,
					);
				}
			}

			let lastError: Error | null = null;

			for (let attempt = 0; attempt <= maxRetries; attempt++) {
				try {
					const result = await executePaymentFlow.call(
						this,
						url,
						method,
						requestBody,
						extraHeaders,
						walletPrivateKey,
						facilitatorUrl,
					);

					returnData.push({
						json: result,
						pairedItem: { item: i },
					});

					lastError = null;
					break;
				} catch (error) {
					lastError =
						error instanceof Error ? error : new Error(String(error));
					if (attempt < maxRetries) {
						await new Promise((resolve) => setTimeout(resolve, 1000));
					}
				}
			}

			if (lastError) {
				throw new Error(
					`Item ${i}: x402 payment flow failed after ${maxRetries + 1} attempts — ${lastError.message}`,
				);
			}
		}

		return [returnData];
	}
}

/**
 * Execute the full x402 payment flow:
 * 1. Send initial request, expect 402
 * 2. Parse payment requirements from response header
 * 3. Create and sign payment payload
 * 4. Verify with facilitator
 * 5. Resend request with payment header
 */
async function executePaymentFlow(
	this: IExecuteFunctions,
	url: string,
	method: string,
	body: IDataObject | undefined,
	extraHeaders: Record<string, string>,
	walletPrivateKey: string,
	facilitatorUrl: string,
): Promise<IDataObject> {
	// Step 1: Send initial request to get 402 payment requirements
	const initialResponse = (await this.helpers.httpRequest({
		method: method as IHttpRequestMethods,
		url,
		body,
		headers: {
			"Content-Type": "application/json",
			...extraHeaders,
		},
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	})) as IDataObject;

	const statusCode = initialResponse.statusCode as number;

	if (statusCode !== 402) {
		// Not a 402 — return the response directly (endpoint not paywalled)
		return {
			statusCode,
			body: initialResponse.body as IDataObject,
			headers: initialResponse.headers as IDataObject,
			paid: false,
		};
	}

	// Extract payment requirements from header
	const responseHeaders = initialResponse.headers as IDataObject;
	const requirementsHeader = (responseHeaders["x-402-payment-required"] ??
		responseHeaders["X-402-Payment-Required"]) as string | undefined;

	if (!requirementsHeader) {
		throw new Error(
			"Server returned 402 but no x-402-payment-required header found",
		);
	}

	const decoded = Buffer.from(requirementsHeader, "base64").toString("utf-8");
	const paymentRequirements = JSON.parse(decoded) as PaymentRequirement;

	// Step 2: Create payment payload with signature
	const nonce = Date.now().toString();
	const senderAddress = deriveAddress(
		walletPrivateKey,
		paymentRequirements.network,
	);

	const paymentPayload: IDataObject = {
		scheme: paymentRequirements.scheme,
		network: paymentRequirements.network,
		amount: paymentRequirements.maxAmountRequired,
		from: senderAddress,
		to: paymentRequirements.payTo,
		resource: paymentRequirements.resource,
		nonce,
		signature: signPayment(walletPrivateKey, paymentRequirements, nonce),
	};

	// Step 3: Verify payment with facilitator
	const verifyResponse = (await this.helpers.httpRequest({
		method: "POST" as IHttpRequestMethods,
		url: `${facilitatorUrl}/verify`,
		body: {
			payload: paymentPayload,
			paymentRequirements,
		},
		headers: { "Content-Type": "application/json" },
		returnFullResponse: false,
		ignoreHttpStatusErrors: true,
	})) as IDataObject;

	if (verifyResponse.valid === false) {
		throw new Error(
			`Payment verification failed: ${(verifyResponse.invalidReason as string) ?? "unknown reason"}`,
		);
	}

	// Step 4: Resend request with payment header
	const paymentHeaderValue = Buffer.from(
		JSON.stringify(paymentPayload),
	).toString("base64");

	const finalResponse = (await this.helpers.httpRequest({
		method: method as IHttpRequestMethods,
		url,
		body,
		headers: {
			"Content-Type": "application/json",
			"x-402-payment": paymentHeaderValue,
			...extraHeaders,
		},
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	})) as IDataObject;

	const finalStatus = finalResponse.statusCode as number;

	if (finalStatus === 402) {
		throw new Error(
			"Payment was sent but server still returned 402 — payment may have been rejected",
		);
	}

	return {
		statusCode: finalStatus,
		body: finalResponse.body as IDataObject,
		headers: finalResponse.headers as IDataObject,
		paid: true,
		payment: {
			amount: paymentRequirements.maxAmountRequired,
			network: paymentRequirements.network,
			payTo: paymentRequirements.payTo,
			from: senderAddress,
		},
	};
}

/**
 * Derive a wallet address from a private key.
 *
 * NOTE: This uses SHA-256 hash derivation as a portable approach that works
 * without external crypto dependencies. For production deployments with
 * on-chain verification, replace with ethers.js (EVM) or @solana/web3.js.
 */
function deriveAddress(privateKey: string, network: string): string {
	const keyBytes = privateKey.startsWith("0x")
		? privateKey.slice(2)
		: privateKey;
	const hash = crypto.createHash("sha256").update(keyBytes).digest("hex");

	if (network.startsWith("solana")) {
		return hash.slice(0, 44);
	}
	return "0x" + hash.slice(0, 40);
}

/**
 * Sign a payment payload with the wallet private key.
 *
 * NOTE: This uses HMAC-SHA256 as a portable signing method. For production
 * deployments requiring on-chain signature verification, replace with
 * ethers.js Wallet.signMessage (EVM) or nacl.sign (Solana).
 */
function signPayment(
	privateKey: string,
	requirements: PaymentRequirement,
	nonce: string,
): string {
	const message = JSON.stringify({
		amount: requirements.maxAmountRequired,
		payTo: requirements.payTo,
		network: requirements.network,
		resource: requirements.resource,
		nonce,
	});
	const keyBytes = privateKey.startsWith("0x")
		? privateKey.slice(2)
		: privateKey;
	return crypto.createHmac("sha256", keyBytes).update(message).digest("hex");
}
