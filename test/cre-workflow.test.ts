import { describe, expect, it } from "vitest";

import { canonicalizeUsgsEvent } from "../cre/quakeproof-verifier/usgs.js";

describe("CRE earthquake workflow", () => {
  it("canonicalizes a USGS event into deterministic report data", () => {
    const payload = canonicalizeUsgsEvent({
      type: "FeatureCollection",
      features: [{
        id: "us7000test",
        properties: {
          mag: 6.2,
          time: 1_800_000_000_000,
          updated: 1_800_000_060_000,
          tsunami: 1,
          alert: "yellow",
          sig: 650
        },
        geometry: { type: "Point", coordinates: [120.5, 18.2, 15] }
      }]
    }, "us7000test");

    expect(JSON.parse(payload)).toEqual({
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
    expect(Buffer.byteLength(payload)).toBeLessThan(256);
  });

  it("rejects a mismatched event", () => {
    expect(() => canonicalizeUsgsEvent({
      type: "FeatureCollection",
      features: [{ id: "different", properties: {}, geometry: null }]
    }, "us7000test")).toThrow(/not found or is malformed/);
  });
});
