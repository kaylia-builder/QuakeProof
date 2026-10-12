import type { RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { validateDiscoveryExtensionSpec } from "@x402/extensions/bazaar";
import handleRequest, { createApp, createPaymentRoutes } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { BASE_SEPOLIA_USDC } from "../src/payment.js";
import { UpstreamError, type UsgsClient } from "../src/usgs.js";
import type { UsgsFeature } from "../src/earthquakes.js";

const config: AppConfig = {
  payTo: "0x1111111111111111111111111111111111111111",
  payment: BASE_SEPOLIA_USDC,
  price: "$0.01",
  facilitatorUrl: "http://facilitator.invalid/v2",
  upstreamUrl: new URL("https://earthquake.usgs.gov/fdsnws/event/1/"),
  upstreamTimeoutMs: 100,
  serviceDescription: "Test earthquake service"
};

const feature: UsgsFeature = {
  id: "us7000test",
  type: "Feature",
  properties: {
    mag: 6.2,
    place: "Test Region",
    time: Date.parse("2026-09-16T10:00:00.000Z"),
    updated: Date.parse("2026-09-16T10:05:00.000Z"),
    url: "https://earthquake.usgs.gov/earthquakes/eventpage/us7000test",
    detail: null,
    felt: 20,
    cdi: 4,
    mmi: 5,
    alert: "yellow",
    status: "reviewed",
    tsunami: 1,
    sig: 650,
    title: "M 6.2 - Test Region"
  },
  geometry: { type: "Point", coordinates: [120.5, 18.2, 15] }
};

function paymentGuard(events: string[]): RequestHandler {
  return (req, res, next) => {
    if (req.header("x-test-payment") !== "valid") {
      res.setHeader("PAYMENT-REQUIRED", "test-challenge");
      res.status(402).json({ error: "payment_required" });
      return;
    }
    events.push("verify");
    res.on("finish", () => {
      if (res.statusCode < 400) events.push("settle");
    });
    next();
  };
}

describe("QuakeProof HTTP API", () => {
  it("exports a Vercel-compatible request handler", () => {
    expect(typeof handleRequest).toBe("function");
  });

  it("publishes a public service index", async () => {
    const app = createApp(config, { paymentGuard: paymentGuard([]) });
    const response = await request(app).get("/");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      service: "quakeproof",
      network: "eip155:84532",
      discovery: "x402 Bazaar metadata is included in each 402 challenge",
      paidEndpoints: [
        "/v1/earthquakes/recent",
        "/v1/earthquakes/nearby",
        "/v1/earthquakes/{eventId}/risk"
      ]
    });
  });

  it("publishes valid Bazaar discovery metadata for every paid route", () => {
    const routes = createPaymentRoutes(config) as Record<
      string,
      { serviceName?: string; tags?: string[]; extensions?: Record<string, unknown> }
    >;

    expect(Object.keys(routes)).toEqual([
      "GET /v1/earthquakes/recent",
      "GET /v1/earthquakes/nearby",
      "GET /v1/earthquakes/:eventId/risk"
    ]);

    for (const route of Object.values(routes)) {
      expect(route.serviceName).toBe("quakeproof");
      expect(route.tags).toContain("x402");
      const bazaar = route.extensions?.bazaar;
      expect(bazaar).toBeDefined();
      expect(validateDiscoveryExtensionSpec(bazaar as Record<string, unknown>)).toEqual({ valid: true });
    }
  });

  it("keeps health checks public", async () => {
    const app = createApp(config, { paymentGuard: paymentGuard([]), usgsClient: async () => ({ type: "FeatureCollection", features: [] }) });
    const response = await request(app).get("/healthz");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true, network: "eip155:84532", price: "$0.01" });
  });

  it("returns 402 before invoking the upstream when no payment is attached", async () => {
    let calls = 0;
    const app = createApp(config, {
      paymentGuard: paymentGuard([]),
      usgsClient: async () => {
        calls += 1;
        return { type: "FeatureCollection", features: [] };
      }
    });
    const response = await request(app).get("/v1/earthquakes/recent");
    expect(response.status).toBe(402);
    expect(response.headers["payment-required"]).toBe("test-challenge");
    expect(calls).toBe(0);
  });

  it("runs verify -> upstream -> settle for a successful paid request", async () => {
    const events: string[] = [];
    const client: UsgsClient = async (query) => {
      events.push("upstream");
      expect(query).toMatchObject({ minmagnitude: 5, limit: 3, orderby: "time" });
      return { type: "FeatureCollection", metadata: { generated: Date.parse("2026-09-17T00:00:00Z") }, features: [feature] };
    };
    const app = createApp(config, {
      paymentGuard: paymentGuard(events),
      usgsClient: client,
      now: () => new Date("2026-09-17T00:00:00Z")
    });
    const response = await request(app)
      .get("/v1/earthquakes/recent?hours=24&minMagnitude=5&limit=3")
      .set("x-test-payment", "valid");
    expect(response.status).toBe(200);
    expect(response.body.earthquakes[0]).toMatchObject({
      id: "us7000test",
      magnitude: 6.2,
      tsunamiFlag: true,
      coordinates: { longitude: 120.5, latitude: 18.2, depthKm: 15 }
    });
    expect(events).toEqual(["verify", "upstream", "settle"]);
  });

  it("does not settle when the upstream fails", async () => {
    const events: string[] = [];
    const app = createApp(config, {
      paymentGuard: paymentGuard(events),
      usgsClient: async () => {
        events.push("upstream");
        throw new UpstreamError("timeout");
      }
    });
    const response = await request(app)
      .get("/v1/earthquakes/recent")
      .set("x-test-payment", "valid");
    expect(response.status).toBe(502);
    expect(response.body.error).toBe("upstream_failure");
    expect(events).toEqual(["verify", "upstream"]);
  });

  it("validates nearby coordinates before calling USGS", async () => {
    let calls = 0;
    const app = createApp(config, {
      paymentGuard: paymentGuard([]),
      usgsClient: async () => {
        calls += 1;
        return { type: "FeatureCollection", features: [] };
      }
    });
    const response = await request(app)
      .get("/v1/earthquakes/nearby?latitude=95&longitude=114")
      .set("x-test-payment", "valid");
    expect(response.status).toBe(400);
    expect(response.body.detail).toContain("latitude");
    expect(calls).toBe(0);
  });

  it("returns a deterministic risk assessment for one event", async () => {
    const app = createApp(config, {
      paymentGuard: paymentGuard([]),
      usgsClient: async (query) => {
        expect(query).toEqual({ eventid: "us7000test" });
        return { type: "FeatureCollection", features: [feature] };
      }
    });
    const response = await request(app)
      .get("/v1/earthquakes/us7000test/risk")
      .set("x-test-payment", "valid");
    expect(response.status).toBe(200);
    expect(response.body.risk).toMatchObject({ score: 98, level: "severe" });
    expect(response.body.risk.factors).toContain("USGS tsunami flag is set");
  });
});
