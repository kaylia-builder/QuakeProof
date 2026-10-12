# Archived Kite baseline evidence

This file records the pre-hackathon payment state preserved by the
`hackathon-baseline` Git tag (`db72440`). It is historical evidence, not the
current QuakeProof target configuration.

- Public service health returned HTTP 200.
- Every paid route returned a decodable x402 v2 `402` challenge.
- The challenge used `exact`, Kite testnet `eip155:2368`, and PYUSD.
- Pieverse advertised `exact` support on `eip155:2368`.
- On 2026-09-25, verification succeeded but settlement returned
  `transaction_failed`; no successful settlement transaction hash was produced.
- The investigation found a `validAfter` compatibility difference between the
  Kite gasless PYUSD path and the standard x402 EVM client.

This limitation is why the hackathon version moves to the standard Base Sepolia
USDC path before adding Chainlink Functions.
