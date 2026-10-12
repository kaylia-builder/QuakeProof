# QuakeProof development roadmap

Progress is gate-based: a phase is complete only when its evidence exists. A
working configuration or unsigned `402` challenge is not treated as proof of
successful settlement.

## Phase 1 — Public testnet service

Status: complete.

- Public HTTPS deployment and health check
- Three x402-protected earthquake endpoints
- Bazaar discovery metadata and manifest validation
- Automated tests for validation, normalization, risk scoring, and payment
  lifecycle ordering

## Phase 2 — Testnet payment closure

Status: blocked on external payment-path compatibility and merchant admission.

Exit criteria:

- The service host is executable by the chosen payment client
- `recent`, `nearby`, and `risk` each return a paid HTTP 2xx response
- Every response includes successful settlement evidence and a transaction hash
- The evidence file contains no private key, signature, or bearer credential
- The known upstream-failure test proves that settlement is not attempted

Use the repository's restricted direct client when a dedicated testnet wallet
is available:

```bash
TESTNET_PAYER_PRIVATE_KEY=0x... npm run testnet:paid-smoke
```

Kite Passport currently rejects hosts outside its executable catalog before
payment. Catalog admission is therefore an external dependency, not a service
runtime failure.

## Phase 3 — Mainnet canary

Status: not started. Do not enter until Phase 2 is complete.

Exit criteria:

- A separate mainnet deployment passes the mainnet verification profile
- Receiver ownership and USDC.e asset details are independently confirmed
- Per-request and total spend caps are set for the canary payer
- One endpoint completes a low-value paid canary with a confirmed transaction
- Logs, alerting, rollback, and configuration ownership are documented

Read-only preflight:

```bash
BASE_URL=https://your-service.example \
EXPECTED_NETWORK=mainnet \
EXPECTED_PRICE_USD=0.01 \
EXPECTED_PAY_TO=0xYourReceiver \
npm run verify:deployment
```

## Phase 4 — Production operation

Status: planned.

- Add request and settlement observability without logging payment signatures
- Add abuse controls and rate limits
- Define availability and upstream-failure alerts
- Track paid-call success rate, settlement latency, and revenue
- Review pricing after real usage data exists
