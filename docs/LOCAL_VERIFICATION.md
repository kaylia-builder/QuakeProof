# Local verification

Run the complete local verification sequence:

```bash
npm ci
npm run check
npm run build
```

The automated suite covers:

- Base Sepolia USDC amount conversion
- unpaid HTTP 402 behavior and Bazaar metadata
- `verify → upstream → settle` ordering
- no settlement after upstream failure
- validation, normalization, and deterministic risk scoring

After deploying, verify unsigned challenges:

```bash
BASE_URL=https://your-deployment.example \
EXPECTED_NETWORK=base-sepolia \
EXPECTED_PRICE_USD=0.01 \
EXPECTED_PAY_TO=0xYourReceiver \
npm run verify:deployment
```

Then use a dedicated Base Sepolia payer holding only test assets:

```bash
QUAKEPROOF_BASE_URL=https://your-deployment.example \
TESTNET_PAYER_PRIVATE_KEY=0x... \
npm run testnet:paid-smoke
```

The paid client is restricted to Base Sepolia USDC, `$0.01` per call, and the
three known QuakeProof endpoints. It writes bounded, secret-free evidence to
the gitignored `testnet-paid-evidence.json`.
