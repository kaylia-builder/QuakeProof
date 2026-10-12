# Submission evidence

Complete this file after the public testnet deployment. Do not include private
keys, seed phrases, login codes, bearer tokens, or complete payment signatures.

## Identity and revision

- Repository: https://github.com/kaylia-builder/QuakeProof
- Contribution commits: use the current weekly commit links submitted to the
  KiteAI bounty dashboard; this file no longer pins only the initial revision.
- Maintainer: `kaylia-builder`
- Contribution direction: `x402-service`

## Deployment

- Public HTTPS base URL: https://quakepay-x402.vercel.app
- Network: `eip155:2368` (Kite testnet)
- Receiver address: `0x1617Ae836b163d055DFa0655D9100f35864953f0`
- Price: `$0.01` per request
- Health check: https://quakepay-x402.vercel.app/healthz (HTTP 200)

## Automated verification

- CI runs: https://github.com/kaylia-builder/QuakeProof/actions
- `npm run check`: passed (18 tests)
- Manifest validation: passed against the official Kite x402 schema
- All paid routes advertise valid x402 Bazaar discovery metadata with request
  schemas, response examples, service identity, and Kite capability tags.

## Unpaid request evidence

Record the timestamp, request URL, HTTP 402 status, and decoded
`PAYMENT-REQUIRED` challenge. Redact the payment signature if one is present.

```text
Verified: 2026-09-17T12:29:15.547Z
GET /v1/earthquakes/recent: HTTP 402
GET /v1/earthquakes/nearby: HTTP 402
GET /v1/earthquakes/{eventId}/risk: HTTP 402
x402Version: 2
scheme: exact
network: eip155:2368
amount: 10000000000000000
asset: 0x8E04D099b1a8Dd20E6caD4b2Ab2B405B98242ec9 (PYUSD)
payTo: 0x1617Ae836b163d055DFa0655D9100f35864953f0
resource URL protocol: HTTPS
```

## Paid 2xx examples

Record one successful paid request for every endpoint. Include the response,
timestamp, and transaction hash or Kite Passport activity identifier.

Run `npm run testnet:paid-smoke` with a dedicated Kite testnet payer. The
gitignored `testnet-paid-evidence.json` output contains the timestamp, payer,
endpoint URLs, and settlement transaction hashes needed below.

### Recent earthquakes

```text
PENDING
```

### Nearby earthquakes

```text
PENDING
```

### Event risk

```text
PENDING
```

## Failure and no-settlement evidence

Attach the automated test result showing that an upstream error returns 502 and
does not invoke settlement. If a controlled deployed failure test is performed,
record it here without exposing credentials.

```text
PENDING
```

## Changelog

- Initial TypeScript/Express x402 service.
- USGS recent and nearby earthquake queries.
- Deterministic event risk screen.
- Input bounds, upstream timeout, normalized responses, tests, CI, container,
  schema-validated manifest, and submission checklist.
- Standard x402 Bazaar discovery metadata for all three paid Kite endpoints.
- Self-claimable Kite testnet PYUSD flow and direct paid smoke-test client.
