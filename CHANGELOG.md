# Changelog

## v0.2.0 — 2026-05-19

### Added

- **X402 Catalog node** — query the SmartFlow Observatory x402 endpoint catalogue (58k+ endpoints). Five operations:
  - Get Catalog Stats
  - List Endpoints (filters: chain, source, status, spec_valid, volume_gt, limit, offset)
  - Search Endpoints
  - Get Endpoint Details
  - Get Active Endpoints (window_days 1-90, v0.3.0 backend feature)
- **SmartFlow Mapper API credential** — separate credential for catalogue queries, with built-in connection test against `/v1/stats`.

### Changed

- README rewritten with three-node coverage (Trigger + Pay + Catalog) and dual-credential configuration section.
- Package keywords expanded (`catalog`, `mapper`, `discovery`, `smartflow`, `observatory`).

## v0.1.0 — Initial release

- **X402 Trigger** — webhook trigger that accepts x402 micropayments (HTTP 402 + facilitator verification + on-chain settlement)
- **X402 Pay** — sends x402 payments to protected endpoints, handles full 402 flow
- **x402 API credential** — wallet private key + facilitator URL + receiver address
- Supported networks: Base, Base Sepolia, Solana, Solana Devnet
