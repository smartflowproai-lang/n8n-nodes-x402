# n8n-nodes-x402

[![npm](https://img.shields.io/npm/v/n8n-nodes-x402)](https://www.npmjs.com/package/n8n-nodes-x402)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE.md)

n8n community nodes for **x402 micropayments** — accept and send HTTP 402 payments in your n8n workflows without writing code.

## Nodes

### X402 Trigger

Webhook trigger that accepts x402 micropayments. When a request arrives:

- **Without payment** → returns HTTP 402 with payment requirements
- **With valid payment** → verifies via facilitator, settles on-chain, passes data to workflow

Use it to monetize any n8n workflow — charge per API call, per automation run, per data request.

### X402 Pay

Send x402 payments to protected endpoints. Handles the full payment flow:

1. Sends request to target URL
2. Receives 402 payment requirements
3. Signs payment with your wallet
4. Resends with payment header
5. Returns the response

Use it to consume x402-protected APIs from your workflows.

## Installation

In your n8n instance:

```
Settings → Community Nodes → Install → n8n-nodes-x402
```

Or via npm:

```bash
npm install n8n-nodes-x402
```

## Configuration

Create **x402 API** credentials in n8n with:

- **Wallet Private Key** — for signing payments (Pay node) or receiving (Trigger node)
- **Facilitator URL** — payment verification endpoint (default: x402.org)
- **Receiver Address** — your wallet address for receiving payments

## Supported Networks

- Base (Coinbase L2)
- Base Sepolia (testnet)
- Solana
- Solana Devnet

## What is x402?

[x402](https://www.x402.org/) is an open payment protocol that enables machine-to-machine micropayments via HTTP headers. Built by Coinbase, now a Linux Foundation standard with Google, Microsoft, Visa, Mastercard, and Stripe as founding members.

## Links

- [x402 Protocol](https://www.x402.org/)
- [SmartFlow Signal API](https://smartflowproai.com) — live x402-powered trading signals
- [Solana x402 Facilitator](https://github.com/smartflowproai-lang/solana-x402-facilitator)

## Author

**Tom Smart** — [smartflowproai.com](https://smartflowproai.com)

## License

[MIT](LICENSE.md)
