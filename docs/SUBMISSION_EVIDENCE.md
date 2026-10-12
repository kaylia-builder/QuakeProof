# Hackathon submission evidence

Do not include private keys, seed phrases, login codes, bearer tokens, or full
payment signatures in this file.

## Identity and development increment

- Repository: https://github.com/kaylia-builder/QuakeProof
- Pre-hackathon baseline: tag `hackathon-baseline` at commit `db72440`
- Hackathon diff: `git diff hackathon-baseline..HEAD`
- Maintainer: `kaylia-builder`

## Current deployment target

- Network: Base Sepolia (`eip155:84532`)
- Asset: USDC (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`)
- Price: `$0.01` per request
- Public HTTPS base URL: `PENDING`
- Receiver address: `PENDING`

## Required evidence

| Evidence | Status |
|---|---|
| CI, tests, build, and manifest validation | Pending after migration commit |
| Unsigned x402 challenge for all three routes | Pending deployment |
| Paid 2xx plus settlement hash for all three routes | Pending deployment |
| Chainlink Functions request and fulfillment transaction | Not implemented |
| Agent skip and purchase decisions | Not implemented |
| Live dashboard demo | Not implemented |

The archived Kite/PYUSD baseline is in
[`BASELINE_KITE_EVIDENCE.md`](BASELINE_KITE_EVIDENCE.md). It must not be
presented as hackathon payment evidence.
