import { afterEach, describe, expect, it, vi } from "vitest";

import { createUsgsClient } from "../src/usgs.js";

afterEach(() => vi.unstubAllGlobals());

describe("USGS client", () => {
  it("normalizes an event-id Feature response into a collection", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      type: "Feature",
      id: "nc75448431",
      properties: {
        mag: 1.33,
        place: "4 km W of Cobb, CA",
        time: 1_791_828_392_320,
        updated: 1_791_828_487_709,
        url: "https://earthquake.usgs.gov/earthquakes/eventpage/nc75448431",
        detail: null,
        felt: null,
        cdi: null,
        mmi: null,
        alert: null,
        status: "automatic",
        tsunami: 0,
        sig: 27,
        title: "M 1.3 - 4 km W of Cobb, CA"
      },
      geometry: { type: "Point", coordinates: [-122.76, 38.82, 1.85] }
    }), { status: 200 })));
    const client = createUsgsClient(
      new URL("https://earthquake.usgs.gov/fdsnws/event/1/"),
      1_000
    );

    const result = await client({ eventid: "nc75448431" });

    expect(result.type).toBe("FeatureCollection");
    expect(result.features).toHaveLength(1);
    expect(result.features[0]?.id).toBe("nc75448431");
  });
});
