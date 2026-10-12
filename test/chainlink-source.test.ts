import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...values: unknown[]) => Promise<Uint8Array>;

async function executeSource(eventId: string, data: unknown): Promise<string> {
  const source = await readFile(
    new URL("../chainlink/source/verify-earthquake.js", import.meta.url),
    "utf8"
  );
  const run = new AsyncFunction("Functions", "args", source);
  const result = await run(
    {
      makeHttpRequest: async () => ({ data }),
      encodeString: (value: string) => new TextEncoder().encode(value)
    },
    [eventId]
  );
  return new TextDecoder().decode(result);
}

describe("Chainlink Functions earthquake source", () => {
  it("returns a compact deterministic USGS payload", async () => {
    const payload = await executeSource("us7000test", {
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
    });

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

  it("rejects a mismatched event", async () => {
    await expect(executeSource("us7000test", {
      type: "FeatureCollection",
      features: [{ id: "different", properties: {}, geometry: null }]
    })).rejects.toThrow(/not found or malformed/);
  });
});
