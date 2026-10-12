import { describe, expect, it } from "vitest";

import { verifiedPayloadToFeature, VerificationError } from "../src/verification.js";

const payload = JSON.stringify({
  v: 1,
  id: "us7000test",
  m: 6.2,
  lo: 120.5,
  la: 18.2,
  d: 15,
  t: 1_800_000_000_000,
  u: 1_800_000_060_000,
  ts: 1,
  a: "yellow",
  s: 650
});

describe("Chainlink verified payloads", () => {
  it("converts a canonical payload into the existing USGS feature shape", () => {
    expect(verifiedPayloadToFeature(payload, "us7000test")).toMatchObject({
      id: "us7000test",
      properties: {
        mag: 6.2,
        tsunami: 1,
        alert: "yellow",
        status: "verified"
      },
      geometry: { coordinates: [120.5, 18.2, 15] }
    });
  });

  it("rejects a payload for another event", () => {
    expect(() => verifiedPayloadToFeature(payload, "us7000other"))
      .toThrow(VerificationError);
  });

  it("rejects out-of-range coordinates", () => {
    const invalid = JSON.stringify({ ...JSON.parse(payload), la: 95 });
    expect(() => verifiedPayloadToFeature(invalid, "us7000test"))
      .toThrow(/out-of-range latitude/);
  });
});
