# Facilitator compatibility diagnostics

QuakeProof includes a read-only diagnostic command that checks a deployed
service, its unsigned x402 challenge, and the configured facilitator's
advertised capabilities.

```bash
QUAKEPROOF_BASE_URL=https://your-deployment.example npm run diagnose:facilitator
```

The command does not load a private key, create a signature, call settlement,
or transfer tokens. It writes a gitignored `facilitator-diagnostic.json` and
redacts fields whose names indicate credentials or signing material.

## Current target

| Field | Expected value |
|---|---|
| Network | Base Sepolia (`eip155:84532`) |
| Asset | USDC (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`) |
| Price | `$0.01` (`10000` atomic units) |
| Scheme | x402 v2 `exact` |
| Default facilitator | `https://x402.org/facilitator` |

A passing read-only check proves configuration alignment only. Successful
asset-specific settlement requires `npm run testnet:paid-smoke` and a resulting
transaction hash.

The previous Kite/PYUSD result is preserved in
[`BASELINE_KITE_EVIDENCE.md`](BASELINE_KITE_EVIDENCE.md) and in the
`hackathon-baseline` Git tag.

Never publish a payer private key, seed phrase, complete payment signature,
bearer token, or wallet credential with a diagnostic report.
