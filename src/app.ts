/*
 * The x402 server registration originated from an Apache-2.0 TypeScript
 * template. QuakeProof's payment configuration, routing, validation, USGS
 * integration, and responses are project-specific modifications.
 */
import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response
} from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import type { RoutesConfig } from "@x402/core/http";
import {
  bazaarResourceServerExtension,
  declareDiscoveryExtension
} from "@x402/extensions/bazaar";
import { loadConfig, type AppConfig } from "./config.js";
import { assessRisk, normalizeFeature, type UsgsFeature } from "./earthquakes.js";
import { assetMoneyParser } from "./payment.js";
import { createUsgsClient, UpstreamError, type UsgsClient } from "./usgs.js";
import {
  createVerificationClient,
  verifiedPayloadToFeature,
  VerificationError,
  type VerificationClient
} from "./verification.js";

export interface AppDependencies {
  paymentGuard?: RequestHandler;
  usgsClient?: UsgsClient;
  verificationClient?: VerificationClient | null;
  now?: () => Date;
}

class RequestError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
    this.name = "RequestError";
  }
}

const serviceTags = ["earthquake", "usgs", "risk", "x402", "live-data"];

function paidRoute(
  config: AppConfig,
  description: string,
  extensions: Record<string, unknown>
) {
  return {
    accepts: {
      scheme: "exact" as const,
      price: config.price,
      network: config.payment.network,
      payTo: config.payTo,
      maxTimeoutSeconds: 60
    },
    description,
    mimeType: "application/json",
    serviceName: "quakeproof",
    tags: config.chainlink ? [...serviceTags, "chainlink-functions"] : serviceTags,
    extensions
  };
}

/**
 * Describe every paid route with x402 Bazaar metadata so compatible
 * facilitators and agents can discover how to call the service from its 402.
 */
export function createPaymentRoutes(config: AppConfig): RoutesConfig {
  return {
    "GET /v1/earthquakes/recent": paidRoute(
      config,
      "Return recent earthquakes above a configurable magnitude.",
      declareDiscoveryExtension({
        input: { hours: 24, minMagnitude: 4.5, limit: 20 },
        inputSchema: {
          properties: {
            hours: { type: "integer", minimum: 1, maximum: 168 },
            minMagnitude: { type: "number", minimum: 0, maximum: 10 },
            limit: { type: "integer", minimum: 1, maximum: 100 }
          },
          additionalProperties: false
        },
        output: {
          example: {
            query: { hours: 24, minMagnitude: 4.5, limit: 20 },
            count: 1,
            source: "USGS Earthquake Catalog",
            earthquakes: [{ id: "us7000example", magnitude: 5.2, place: "Example Region" }]
          }
        }
      })
    ),
    "GET /v1/earthquakes/nearby": paidRoute(
      config,
      "Return earthquakes near a latitude and longitude.",
      declareDiscoveryExtension({
        input: {
          latitude: 35.6762,
          longitude: 139.6503,
          radiusKm: 250,
          hours: 168,
          minMagnitude: 2.5,
          limit: 20
        },
        inputSchema: {
          properties: {
            latitude: { type: "number", minimum: -90, maximum: 90 },
            longitude: { type: "number", minimum: -180, maximum: 180 },
            radiusKm: { type: "number", minimum: 1, maximum: 2000 },
            hours: { type: "integer", minimum: 1, maximum: 720 },
            minMagnitude: { type: "number", minimum: 0, maximum: 10 },
            limit: { type: "integer", minimum: 1, maximum: 100 }
          },
          required: ["latitude", "longitude"],
          additionalProperties: false
        },
        output: {
          example: {
            query: { latitude: 35.6762, longitude: 139.6503, radiusKm: 250 },
            count: 1,
            source: "USGS Earthquake Catalog",
            earthquakes: [{ id: "us7000example", magnitude: 4.8, place: "Near Tokyo" }]
          }
        }
      })
    ),
    "GET /v1/earthquakes/:eventId/risk": paidRoute(
      config,
      "Normalize one USGS event and produce a deterministic risk screening.",
      declareDiscoveryExtension({
        pathParams: { eventId: "us7000example" },
        pathParamsSchema: {
          properties: {
            eventId: { type: "string", pattern: "^[A-Za-z0-9_-]{3,40}$" }
          },
          required: ["eventId"],
          additionalProperties: false
        },
        output: {
          example: {
            source: "USGS Earthquake Catalog",
            earthquake: { id: "us7000example", magnitude: 6.2 },
            risk: { score: 78, level: "high", factors: ["Strong magnitude"] }
          }
        }
      })
    )
  };
}

function createPaymentGuard(config: AppConfig): RequestHandler {
  const facilitator = new HTTPFacilitatorClient({ url: config.facilitatorUrl });
  const resourceServer = new x402ResourceServer(facilitator).register(
    config.payment.network,
    new ExactEvmScheme().registerMoneyParser(assetMoneyParser(config.payment))
  ).registerExtension(bazaarResourceServerExtension);
  return paymentMiddleware(createPaymentRoutes(config), resourceServer);
}

function scalar(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new RequestError(`${name} must be a single value`);
  return value;
}

function numberParam(
  value: unknown,
  name: string,
  fallback: number,
  min: number,
  max: number
): number {
  const raw = scalar(value, name);
  const parsed = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new RequestError(`${name} must be between ${min} and ${max}`);
  }
  return parsed;
}

function integerParam(
  value: unknown,
  name: string,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = numberParam(value, name, fallback, min, max);
  if (!Number.isInteger(parsed)) throw new RequestError(`${name} must be an integer`);
  return parsed;
}

function startTime(now: Date, hours: number): string {
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
}

export function createApp(config: AppConfig, dependencies: AppDependencies = {}) {
  const app = express();
  const queryUsgs = dependencies.usgsClient ?? createUsgsClient(config.upstreamUrl, config.upstreamTimeoutMs);
  const now = dependencies.now ?? (() => new Date());
  const verificationClient = dependencies.verificationClient === undefined
    ? config.chainlink
      ? createVerificationClient(config.chainlink.rpcUrl, config.chainlink.consumerAddress)
      : undefined
    : dependencies.verificationClient ?? undefined;

  app.disable("x-powered-by");
  // Vercel and Render terminate TLS at their reverse proxy. Trust the nearest
  // proxy so x402 challenges advertise the public https resource URL.
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "32kb" }));

  app.get("/", (_req, res) => {
    res.json({
      ok: true,
      service: "quakeproof",
      description: config.serviceDescription,
      network: config.payment.network,
      asset: config.payment.assetSymbol,
      price: config.price,
      health: "/healthz",
      discovery: "x402 Bazaar metadata is included in each 402 challenge",
      riskData: verificationClient ? "chainlink-functions" : "direct-usgs",
      paidEndpoints: [
        "/v1/earthquakes/recent",
        "/v1/earthquakes/nearby",
        "/v1/earthquakes/{eventId}/risk"
      ]
    });
  });

  app.get("/healthz", (_req, res) => {
    res.json({
      ok: true,
      service: "quakeproof",
      network: config.payment.network,
      asset: config.payment.assetSymbol,
      price: config.price,
      upstream: config.upstreamUrl.origin,
      riskData: verificationClient ? "chainlink-functions" : "direct-usgs"
    });
  });

  app.use(dependencies.paymentGuard ?? createPaymentGuard(config));

  app.get("/v1/earthquakes/recent", async (req, res, next) => {
    try {
      const hours = integerParam(req.query.hours, "hours", 24, 1, 168);
      const minMagnitude = numberParam(req.query.minMagnitude, "minMagnitude", 4.5, 0, 10);
      const limit = integerParam(req.query.limit, "limit", 20, 1, 100);
      const data = await queryUsgs({
        starttime: startTime(now(), hours),
        minmagnitude: minMagnitude,
        orderby: "time",
        limit
      });
      res.json({
        query: { hours, minMagnitude, limit },
        count: data.features.length,
        generatedAt: data.metadata?.generated
          ? new Date(data.metadata.generated).toISOString()
          : now().toISOString(),
        source: "USGS Earthquake Catalog",
        earthquakes: data.features.map(normalizeFeature)
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/earthquakes/nearby", async (req, res, next) => {
    try {
      const latitude = numberParam(req.query.latitude, "latitude", Number.NaN, -90, 90);
      const longitude = numberParam(req.query.longitude, "longitude", Number.NaN, -180, 180);
      const radiusKm = numberParam(req.query.radiusKm, "radiusKm", 250, 1, 2000);
      const hours = integerParam(req.query.hours, "hours", 168, 1, 720);
      const minMagnitude = numberParam(req.query.minMagnitude, "minMagnitude", 2.5, 0, 10);
      const limit = integerParam(req.query.limit, "limit", 20, 1, 100);
      const data = await queryUsgs({
        latitude,
        longitude,
        maxradiuskm: radiusKm,
        starttime: startTime(now(), hours),
        minmagnitude: minMagnitude,
        orderby: "time",
        limit
      });
      res.json({
        query: { latitude, longitude, radiusKm, hours, minMagnitude, limit },
        count: data.features.length,
        source: "USGS Earthquake Catalog",
        earthquakes: data.features.map(normalizeFeature)
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/earthquakes/:eventId/risk", async (req, res, next) => {
    try {
      const eventId = req.params.eventId;
      if (!/^[A-Za-z0-9_-]{3,40}$/.test(eventId)) {
        throw new RequestError("eventId contains unsupported characters");
      }
      let feature: UsgsFeature;
      let verification;
      if (verificationClient) {
        const record = await verificationClient.getLatest(eventId);
        if (!record) {
          throw new RequestError(`earthquake ${eventId} has not been verified onchain`, 404);
        }
        const maxAgeSeconds = config.chainlink?.maxAgeSeconds ?? 86_400;
        const ageSeconds = Math.floor(now().getTime() / 1000) - record.verifiedAt;
        if (ageSeconds < 0 || ageSeconds > maxAgeSeconds) {
          throw new RequestError(`onchain verification for ${eventId} is stale`, 409);
        }
        feature = verifiedPayloadToFeature(record.payload, eventId);
        verification = {
          provider: "Chainlink Functions",
          network: "eip155:84532",
          contract: record.contractAddress,
          requestId: record.requestId,
          responseHash: record.responseHash,
          verifiedAt: new Date(record.verifiedAt * 1000).toISOString()
        };
      } else {
        const data = await queryUsgs({ eventid: eventId });
        feature = data.features[0];
        if (!feature) throw new RequestError(`earthquake ${eventId} was not found`, 404);
      }
      res.json({
        source: verification
          ? "USGS Earthquake Catalog via Chainlink Functions"
          : "USGS Earthquake Catalog",
        verification,
        earthquake: normalizeFeature(feature),
        risk: assessRisk(feature)
      });
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof RequestError) {
      res.status(error.status).json({ error: "invalid_request", detail: error.message });
      return;
    }
    if (error instanceof UpstreamError) {
      res.status(502).json({ error: "upstream_failure", detail: error.message });
      return;
    }
    if (error instanceof VerificationError) {
      res.status(502).json({ error: "verification_failure", detail: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}

// Vercel recognizes src/app.ts as an Express entry point. Keep initialization
// lazy so importing createApp in tests does not contact the facilitator.
let runtimeApp: ReturnType<typeof createApp> | undefined;

export default function handleRequest(req: Request, res: Response): void {
  runtimeApp ??= createApp(loadConfig());
  runtimeApp(req, res);
}
