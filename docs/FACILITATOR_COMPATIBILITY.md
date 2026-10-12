# Facilitator compatibility diagnostics

QuakeProof includes a read-only diagnostic command for separating service
configuration problems from facilitator capability and settlement problems.

```bash
npm run diagnose:facilitator
```

The command makes three unsigned GET requests:

1. QuakeProof `/healthz`
2. One paid endpoint without a payment, to inspect its `402` challenge
3. The configured facilitator `/supported` endpoint

It does not load a private key, create a payment signature, call `/verify` or
`/settle`, or transfer tokens. The generated `facilitator-diagnostic.json` is
gitignored and redacts fields whose names indicate signing material or secrets.

Set `QUAKEPROOF_BASE_URL`, `FACILITATOR_URL`, or `DIAGNOSTIC_OUT` to diagnose a
different HTTPS deployment, facilitator, or output path.

## Latest read-only result

Run at `2026-10-09T10:05:04.764Z` (`2026-10-09` in Hong Kong):

| Check | Result | Evidence |
|---|---|---|
| Public service health | Pass | HTTP 200 |
| x402 challenge | Pass | HTTP 402 with a decodable x402 v2 challenge |
| Kite payment terms | Pass | `exact`, `eip155:2368`, PYUSD, `0.01` |
| Facilitator capability announcement | Pass | Pieverse `/supported` lists `exact` on `eip155:2368` |
| Asset-specific settlement | Not tested | A read-only capability check cannot prove settlement |

The important distinction is that `/supported` advertises a network and scheme,
not successful settlement for every token contract on that network.

## Known paid-test result

On 2026-09-25, the restricted paid smoke client created a valid PYUSD payment
for the public service. Pieverse accepted verification but returned
`transaction_failed` during settlement. No PYUSD was deducted and no successful
settlement transaction hash was produced.

The Kite gasless PYUSD path examined during the same investigation required an
authorization `validAfter` later than the latest block time, while the standard
x402 EVM client generated `validAfter=0`. This is recorded as a compatibility
finding, not as proof that QuakeProof completed a paid request.

## Interpretation

- A failing health or challenge check points to the QuakeProof deployment.
- A missing Kite capability points to facilitator routing or configuration.
- Passing all read-only checks means only that configuration and advertised
  capabilities align.
- Only `npm run testnet:paid-smoke` can produce endpoint-level `2xx` responses
  and settlement transaction hashes after upstream compatibility is fixed. A
  failed run still writes bounded evidence containing the failed endpoint,
  failure stage, and a safe error code, without copying the original SDK error.

Never publish a payer private key, seed phrase, complete payment signature,
bearer token, or other wallet credential with a diagnostic report.
