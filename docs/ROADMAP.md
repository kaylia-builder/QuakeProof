# QuakeProof hackathon roadmap

Progress is evidence-based: a phase is complete only when its test output or
transaction hash is recorded.

## Phase 0 — Baseline and identity

Status: complete.

- Pre-hackathon code preserved at tag `hackathon-baseline`
- Project renamed from QuakePay to QuakeProof
- Repository moved to `kaylia-builder/QuakeProof`

## Phase 1 — Standard EVM x402 payment path

Status: implementation complete; deployment evidence pending.

- Base Sepolia (`eip155:84532`) and USDC defaults
- Generic environment-driven EVM asset configuration
- x402 Foundation facilitator default
- Restricted paid smoke client with per-payment asset and amount limits

Exit criterion: all three endpoints return paid HTTP 2xx responses with Base
Sepolia settlement transaction hashes.

## Phase 2 — Chainlink Functions verification

Status: not started.

- Add a Functions consumer contract on Base Sepolia
- Fetch and normalize USGS data through Chainlink Functions
- Store event identifier, score, timestamp, and source digest onchain
- Cross-check the onchain result against the TypeScript risk implementation

## Phase 3 — Autonomous buyer and demo

Status: planned.

- Agent monitors verified reports and applies region/risk/budget policies
- Agent skips irrelevant events and buys relevant reports through x402
- Dashboard explains every decision and links both transaction types
- README documents hackathon-only changes from `hackathon-baseline`
