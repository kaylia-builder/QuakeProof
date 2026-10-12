import type { UsgsCollection, UsgsFeature } from "./earthquakes.js";

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

export type UsgsQuery = Record<string, string | number>;
export type UsgsClient = (query: UsgsQuery) => Promise<UsgsCollection>;

export function createUsgsClient(baseUrl: URL, timeoutMs: number): UsgsClient {
  return async (query) => {
    const url = new URL("query", baseUrl);
    url.searchParams.set("format", "geojson");
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, String(value));
    }

    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          accept: "application/geo+json, application/json",
          "user-agent": "quakeproof/0.1 (+https://github.com/kaylia-builder/QuakeProof)"
        }
      });
    } catch (error) {
      throw new UpstreamError(`USGS request failed: ${String(error)}`);
    }

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new UpstreamError(`USGS returned ${response.status}: ${detail}`, response.status);
    }
    const data = (await response.json()) as UsgsCollection | UsgsFeature;
    if (data.type === "FeatureCollection" && Array.isArray(data.features)) {
      return data;
    }
    if (data.type === "Feature" && typeof data.id === "string") {
      return { type: "FeatureCollection", features: [data] };
    }
    throw new UpstreamError("USGS returned an unexpected response shape");
  };
}
