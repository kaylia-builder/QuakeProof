const eventId = args[0];

if (!eventId || !/^[A-Za-z0-9_-]{3,40}$/.test(eventId)) {
  throw Error("invalid USGS event id");
}

const response = await Functions.makeHttpRequest({
  url: "https://earthquake.usgs.gov/fdsnws/event/1/query",
  params: { format: "geojson", eventid: eventId },
  timeout: 8000
});

if (response.error) {
  throw Error("USGS request failed");
}

const collection = response.data;
const feature = collection?.type === "FeatureCollection"
  ? collection.features?.[0]
  : collection;

if (!feature || feature.id !== eventId || feature.geometry?.type !== "Point") {
  throw Error("USGS event not found or malformed");
}

const properties = feature.properties ?? {};
const coordinates = feature.geometry.coordinates;
const finiteOrNull = value => Number.isFinite(value) ? value : null;
const finiteRequired = (value, name) => {
  if (!Number.isFinite(value)) throw Error(`missing ${name}`);
  return value;
};
const allowedAlerts = ["green", "yellow", "orange", "red"];

// Short keys keep the response well below the Functions response-size limit.
// Object insertion order is fixed so every DON node produces identical bytes.
const payload = {
  v: 1,
  id: eventId,
  m: finiteOrNull(properties.mag),
  lo: finiteRequired(coordinates[0], "longitude"),
  la: finiteRequired(coordinates[1], "latitude"),
  d: finiteRequired(coordinates[2], "depth"),
  t: finiteRequired(properties.time, "event time"),
  u: finiteRequired(properties.updated, "update time"),
  ts: properties.tsunami === 1 ? 1 : 0,
  a: allowedAlerts.includes(properties.alert) ? properties.alert : null,
  s: finiteOrNull(properties.sig)
};

return Functions.encodeString(JSON.stringify(payload));
