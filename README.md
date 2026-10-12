# QuakeProof

[![CI](https://github.com/kaylia-builder/QuakeProof/actions/workflows/ci.yml/badge.svg)](https://github.com/kaylia-builder/QuakeProof/actions/workflows/ci.yml)

QuakeProof turns the live [USGS Earthquake Catalog](https://earthquake.usgs.gov/fdsnws/event/1/)
into concise, agent-ready earthquake intelligence paid per request with x402 on
Base Sepolia. It keeps the required lifecycle: **verify payment → call USGS →
settle only after a successful response**.

The service adds value beyond a raw proxy by validating query bounds,
normalizing GeoJSON into a stable response shape, and calculating a transparent,
deterministic risk screen from magnitude, depth, tsunami, and PAGER indicators.

## Payment integration

- Defaults to x402 `exact` payments on Base Sepolia (`eip155:84532`) using USDC.
- Uses the x402 Foundation public facilitator by default.
- Keeps network, asset, decimals, and EIP-712 token metadata configurable for
  other EVM deployments.
- Publishes Bazaar request schemas so compatible agents can discover each paid
  endpoint directly from its `402` challenge.

Chainlink Functions integration is the next hackathon increment. It is not yet
claimed as implemented in this revision.

> Risk scores are informational screening only. Always follow official
> emergency-management guidance.

## Endpoints

`GET /healthz` is free. Every route under `/v1/` costs the configured
`PRICE_USD` (default `$0.01`).

| Route | Purpose |
|---|---|
| `GET /v1/earthquakes/recent` | Recent events filtered by hours and magnitude |
| `GET /v1/earthquakes/nearby` | Events around a coordinate and radius |
| `GET /v1/earthquakes/:eventId/risk` | One normalized event plus deterministic risk screening |

Example unpaid request:

```bash
curl -i "http://localhost:8080/v1/earthquakes/recent?hours=24&minMagnitude=4.5&limit=20"
```

It must return `HTTP/1.1 402 Payment Required` and a `PAYMENT-REQUIRED` header.

Each challenge also includes the standard x402 **Bazaar discovery extension**:
machine-readable query/path schemas, example responses, the `quakeproof`
service name, and capability tags. This lets compatible x402 agents and
facilitators understand how to call all three endpoints directly
from the unpaid `402` response.

The repository's restricted paid smoke client exercises all three endpoints
after deployment.

## Local development

Requirements: Node.js 22+ and an EVM receiver address. The server never needs a
private key.

```bash
npm ci
cp .env.example .env
# Edit PAY_TO in .env with the public receiver address.
npm run dev
```

Never commit `.env`, private keys, seed phrases, login codes, payment signatures,
or upstream credentials.

Verification:

```bash
npm run check
npm run build
```

### Paid Base Sepolia smoke test

The repository includes a direct x402 client so end-to-end testnet settlement
does not depend on a third-party service catalog. Use a dedicated Base Sepolia
wallet holding only test assets; never use a mainnet wallet or commit its key.
Set the deployed service URL explicitly:

```bash
export TESTNET_PAYER_PRIVATE_KEY=0x...
export QUAKEPROOF_BASE_URL=https://your-deployment.example
npm run testnet:paid-smoke
```

The client is deliberately restricted to `eip155:84532`, Base Sepolia USDC,
exactly `$0.01` per payment, and three fixed GET requests. It
writes transaction hashes and endpoint evidence to the gitignored
`testnet-paid-evidence.json`. If a call fails, it still writes the completed
calls plus the failed endpoint, failure stage, and a safe error code; original
SDK messages and signed payloads are excluded. Set `EVIDENCE_OUT` to choose
another output path.

The automated suite verifies unpaid 402 behavior, valid Bazaar discovery
metadata for every paid route, successful
`verify → upstream → settle` ordering, no settlement after upstream failure,
input validation, normalization, risk scoring, EVM asset amounts, and manifest
schema compatibility.

### Read-only facilitator diagnostics

Check the public deployment, its unsigned x402 challenge, and the facilitator's
advertised capabilities without loading a wallet or signing a payment:

```bash
npm run diagnose:facilitator
```

The command writes a gitignored `facilitator-diagnostic.json`. A passing result
confirms configuration and advertised network support; it deliberately reports
settlement compatibility as `not_tested`. Set `QUAKEPROOF_BASE_URL` before
running it. See [`docs/FACILITATOR_COMPATIBILITY.md`](docs/FACILITATOR_COMPATIBILITY.md)
for safe sharing rules and the archived Kite baseline result.

## Configuration

| Variable | Required | Default | Description |
|---|---:|---|---|
| `PAY_TO` | yes | — | Public EVM address receiving payments |
| `X402_NETWORK` | no | `eip155:84532` | CAIP-2 EVM network identifier |
| `X402_ASSET_ADDRESS` | no | Base Sepolia USDC | Payment token contract |
| `X402_ASSET_SYMBOL` | no | `USDC` | Token symbol shown in service metadata |
| `X402_ASSET_DECIMALS` | no | `6` | Token decimal precision |
| `X402_EIP712_NAME` | no | `USDC` | EIP-712 token domain name |
| `X402_EIP712_VERSION` | no | `2` | EIP-712 token domain version |
| `PRICE_USD` | no | `0.01` | Positive USD decimal, up to 6 decimal places |
| `PORT` | no | `8080` | HTTP listen port |
| `FACILITATOR_URL` | no | `https://x402.org/facilitator` | x402 facilitator origin |
| `UPSTREAM_URL` | no | USGS event API | Fixed HTTPS upstream origin |
| `UPSTREAM_TIMEOUT_MS` | no | `8000` | Abort slow upstream calls |

## Deploy

Build the included container and configure environment variables on any host
that provides a public HTTPS origin:

```bash
docker build -t quakeproof .
docker run --rm -p 8080:8080 --env-file .env quakeproof
```

The simplest deployment path is **Vercel Hobby**. Import this GitHub repository
as a new Vercel project and click Deploy. [`vercel.json`](vercel.json) contains
the non-secret testnet service configuration, and `src/server.ts` exports the
Express app as one serverless function. No payment card, private key, or custom
build settings are required.

The repository also retains a [`render.yaml`](render.yaml) Blueprint as an
alternative for an always-running container host. Some Render accounts require
credit-card verification even for free services.

After deployment, verify the live health endpoint and all unpaid challenges:

```bash
BASE_URL=https://your-service.onrender.com npm run verify:deployment
```

The verifier defaults to the Base Sepolia profile. For a Base mainnet candidate,
verify the deployed network, USDC asset, receiver, price, and all three unpaid
challenges explicitly before attempting a paid canary:

```bash
BASE_URL=https://your-service.example \
EXPECTED_NETWORK=base \
EXPECTED_PRICE_USD=0.01 \
EXPECTED_PAY_TO=0xYourReceiver \
npm run verify:deployment
```

Start on Base Sepolia (`eip155:84532`, USDC). After deployment:

1. Confirm `pay_to` in `service.yaml` matches the dashboard-connected service wallet.
2. Add the HTTPS `base_url` and set `status: testnet`.
3. Confirm every example returns 2xx after payment.
4. Save the 402 response, paid response, transaction hash, CI link, and schema
   validation output in [`docs/SUBMISSION_EVIDENCE.md`](docs/SUBMISSION_EVIDENCE.md).
5. Move to Base mainnet only after testnet evidence is complete.

The gated development sequence and mainnet exit criteria are tracked in
[`docs/ROADMAP.md`](docs/ROADMAP.md).

## Data source and attribution

Earthquake data is retrieved from the USGS Earthquake Catalog. Review the
[USGS copyrights and credits policy](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits)
and retain source attribution in derived responses. QuakeProof is not affiliated
with or endorsed by USGS.

## License and upstream attribution

Apache-2.0. The Kite chain configuration and x402 server setup are derived from
the Apache-2.0-licensed
[`gokite-ai/kite-x402-services`](https://github.com/gokite-ai/kite-x402-services)
TypeScript/Express template. See [`NOTICE`](NOTICE) for details. QuakeProof's USGS
query, normalization, risk-screening, validation, testing, deployment, and
evidence code are original additions in this repository.
