# QuakePay x402

[![CI](https://github.com/kaylia-builder/quakepay-x402/actions/workflows/ci.yml/badge.svg)](https://github.com/kaylia-builder/quakepay-x402/actions/workflows/ci.yml)

QuakePay turns the live [USGS Earthquake Catalog](https://earthquake.usgs.gov/fdsnws/event/1/)
into concise, agent-ready earthquake intelligence paid per request with x402 on
the Kite chain. It is based on Kite's official TypeScript/Express wrapper and
keeps the required lifecycle: **verify payment → call USGS → settle only after a
successful response**.

The service adds value beyond a raw proxy by validating query bounds,
normalizing GeoJSON into a stable response shape, and calculating a transparent,
deterministic risk screen from magnitude, depth, tsunami, and PAGER indicators.

## KiteAI integration

- Settles x402 `exact` payments on Kite testnet (`eip155:2368`) with the
  self-claimable PYUSD test token documented by Kite.
- Uses the Pieverse facilitator recommended by the Kite reference service.
- Enforces the Kite review lifecycle: verify first, call USGS second, and settle
  only after a successful upstream response.
- Publishes x402 Bazaar request schemas and response examples so Kite-compatible
  agents and facilitators can discover every paid endpoint from its `402` challenge.

> Risk scores are informational screening only. Always follow official
> emergency-management guidance.

## Endpoints

`GET /healthz` is free. Every route under `/v1/` costs the configured
`PRICE_USD` (default `$0.01`, Kite's documented testnet PYUSD transfer minimum).

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
machine-readable query/path schemas, example responses, the `quakepay-x402`
service name, and Kite-oriented capability tags. This lets compatible Kite
agents and facilitators understand how to call all three endpoints directly
from the unpaid `402` response.

Example paid requests after deployment:

```bash
kpass agent:session execute --method GET \
  --url "$BASE_URL/v1/earthquakes/recent?hours=24&minMagnitude=4.5&limit=20"

kpass agent:session execute --method GET \
  --url "$BASE_URL/v1/earthquakes/nearby?latitude=35.6762&longitude=139.6503&radiusKm=250&hours=168"

# Use an id returned by either list endpoint.
kpass agent:session execute --method GET \
  --url "$BASE_URL/v1/earthquakes/us7000example/risk"
```

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

### Paid Kite testnet smoke test

The repository includes a direct x402 client so end-to-end testnet settlement
does not depend on a third-party service catalog. Use a dedicated test wallet
holding only Kite testnet KITE and PYUSD; never use a mainnet wallet or commit
its key. The verified PYUSD contract publicly mints 10 test PYUSD per `claim()`:

```bash
export TESTNET_PAYER_PRIVATE_KEY=0x...
npm run testnet:claim-pyusd
npm run testnet:paid-smoke
```

The client is deliberately restricted to `eip155:2368`, the configured testnet
PYUSD contract, exactly `$0.01` per payment, and three fixed GET requests. It
writes transaction hashes and endpoint evidence to the gitignored
`testnet-paid-evidence.json`. If a call fails, it still writes the completed
calls plus the failed endpoint, failure stage, and a safe error code; original
SDK messages and signed payloads are excluded. Set `EVIDENCE_OUT` to choose
another output path.

The automated suite verifies unpaid 402 behavior, valid Bazaar discovery
metadata for every paid route, successful
`verify → upstream → settle` ordering, no settlement after upstream failure,
input validation, normalization, risk scoring, Kite asset amounts, and manifest
schema compatibility.

### Read-only facilitator diagnostics

Check the public deployment, its unsigned x402 challenge, and the facilitator's
advertised capabilities without loading a wallet or signing a payment:

```bash
npm run diagnose:facilitator
```

The command writes a gitignored `facilitator-diagnostic.json`. A passing result
confirms configuration and advertised network support; it deliberately reports
settlement compatibility as `not_tested`. See
[`docs/FACILITATOR_COMPATIBILITY.md`](docs/FACILITATOR_COMPATIBILITY.md) for the
latest result, the known PYUSD settlement limitation, and safe sharing rules.

## Configuration

| Variable | Required | Default | Description |
|---|---:|---|---|
| `PAY_TO` | yes | — | Public EVM address receiving payments |
| `KITE_NETWORK` | no | `testnet` | `testnet` or `mainnet` |
| `PRICE_USD` | no | `0.01` | Positive USD decimal, up to 6 decimal places |
| `PORT` | no | `8080` | HTTP listen port |
| `FACILITATOR_URL` | no | `https://facilitator.pieverse.io/v2` | Keep the `/v2` suffix |
| `UPSTREAM_URL` | no | USGS event API | Fixed HTTPS upstream origin |
| `UPSTREAM_TIMEOUT_MS` | no | `8000` | Abort slow upstream calls |

## Deploy

Build the included container and configure environment variables on any host
that provides a public HTTPS origin:

```bash
docker build -t quakepay-x402 .
docker run --rm -p 8080:8080 --env-file .env quakepay-x402
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

The verifier defaults to the testnet profile. For a mainnet candidate, verify
the deployed network, USDC.e asset, receiver, price, and all three unpaid
challenges explicitly before attempting a paid canary:

```bash
BASE_URL=https://your-service.example \
EXPECTED_NETWORK=mainnet \
EXPECTED_PRICE_USD=0.01 \
EXPECTED_PAY_TO=0xYourReceiver \
npm run verify:deployment
```

Start on Kite testnet (`eip155:2368`, PYUSD). After deployment:

1. Confirm `pay_to` in `service.yaml` matches the dashboard-connected service wallet.
2. Add the HTTPS `base_url` and set `status: testnet`.
3. Confirm every example returns 2xx after payment.
4. Save the 402 response, paid response, transaction hash, CI link, and schema
   validation output in [`docs/SUBMISSION_EVIDENCE.md`](docs/SUBMISSION_EVIDENCE.md).
5. Move to mainnet only after testnet evidence is complete.

The gated development sequence and mainnet exit criteria are tracked in
[`docs/ROADMAP.md`](docs/ROADMAP.md).

## Data source and attribution

Earthquake data is retrieved from the USGS Earthquake Catalog. Review the
[USGS copyrights and credits policy](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits)
and retain source attribution in derived responses. QuakePay is not affiliated
with or endorsed by USGS.

## License and upstream attribution

Apache-2.0. The Kite chain configuration and x402 server setup are derived from
the Apache-2.0-licensed
[`gokite-ai/kite-x402-services`](https://github.com/gokite-ai/kite-x402-services)
TypeScript/Express template. See [`NOTICE`](NOTICE) for details. QuakePay's USGS
query, normalization, risk-screening, validation, testing, deployment, and
evidence code are original additions in this repository.
