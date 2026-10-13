type UsgsFeature = {
  id?: unknown;
  type?: unknown;
  properties?: Record<string, unknown> | null;
  geometry?: {
    type?: unknown;
    coordinates?: unknown;
  } | null;
};

type UsgsResponse = UsgsFeature & {
  features?: unknown;
};

function finite(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`USGS response is missing ${name}`);
  }
  return value;
}

function nullableFinite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function canonicalizeUsgsEvent(data: unknown, eventId: string): string {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("USGS response is not an object");
  }

  const response = data as UsgsResponse;
  const feature = response.type === "FeatureCollection"
    ? Array.isArray(response.features) ? response.features[0] as UsgsFeature | undefined : undefined
    : response;
  const coordinates = feature?.geometry?.coordinates;
  if (
    !feature
      || feature.id !== eventId
      || feature.geometry?.type !== "Point"
      || !Array.isArray(coordinates)
      || coordinates.length < 3
  ) {
    throw new Error("USGS event was not found or is malformed");
  }

  const properties = feature.properties ?? {};
  const allowedAlerts = ["green", "yellow", "orange", "red"];
  const alert = typeof properties.alert === "string" && allowedAlerts.includes(properties.alert)
    ? properties.alert
    : null;

  // Fixed key order makes byte-for-byte consensus possible across DON nodes.
  return JSON.stringify({
    v: 1,
    id: eventId,
    m: nullableFinite(properties.mag),
    lo: finite(coordinates[0], "longitude"),
    la: finite(coordinates[1], "latitude"),
    d: finite(coordinates[2], "depth"),
    t: finite(properties.time, "event time"),
    u: finite(properties.updated, "update time"),
    ts: properties.tsunami === 1 ? 1 : 0,
    a: alert,
    s: nullableFinite(properties.sig)
  });
}
