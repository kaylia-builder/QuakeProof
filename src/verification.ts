import {
  createPublicClient,
  http,
  zeroHash,
  type Address,
  type Hex
} from "viem";
import { baseSepolia } from "viem/chains";

import type { UsgsFeature } from "./earthquakes.js";

const consumerAbi = [{
  type: "function",
  name: "getLatest",
  stateMutability: "view",
  inputs: [{ name: "eventId", type: "string" }],
  outputs: [
    { name: "requestId", type: "bytes32" },
    { name: "responseHash", type: "bytes32" },
    { name: "verifiedAt", type: "uint64" },
    { name: "payload", type: "string" }
  ]
}] as const;

export interface VerifiedEventRecord {
  requestId: Hex;
  responseHash: Hex;
  verifiedAt: number;
  payload: string;
  contractAddress: Address;
}

export interface VerificationClient {
  getLatest(eventId: string): Promise<VerifiedEventRecord | null>;
}

export class VerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerificationError";
  }
}

export function createVerificationClient(
  rpcUrl: string,
  contractAddress: Address
): VerificationClient {
  const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  return {
    async getLatest(eventId) {
      try {
        const [requestId, responseHash, verifiedAt, payload] = await client.readContract({
          address: contractAddress,
          abi: consumerAbi,
          functionName: "getLatest",
          args: [eventId]
        });
        if (requestId === zeroHash) return null;
        if (verifiedAt > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new VerificationError("onchain verification timestamp is out of range");
        }
        return {
          requestId,
          responseHash,
          verifiedAt: Number(verifiedAt),
          payload,
          contractAddress
        };
      } catch (error) {
        throw new VerificationError(`Chainlink verification read failed: ${String(error)}`);
      }
    }
  };
}

type Payload = {
  v: number;
  id: string;
  m: number | null;
  lo: number;
  la: number;
  d: number;
  t: number;
  u: number;
  ts: number;
  a: UsgsFeature["properties"]["alert"];
  s: number | null;
};

function finite(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new VerificationError(`verified payload has invalid ${name}`);
  }
  return value;
}

function nullableFinite(value: unknown, name: string): number | null {
  return value === null ? null : finite(value, name);
}

function ranged(value: unknown, name: string, min: number, max: number): number {
  const parsed = finite(value, name);
  if (parsed < min || parsed > max) {
    throw new VerificationError(`verified payload has out-of-range ${name}`);
  }
  return parsed;
}

export function verifiedPayloadToFeature(
  raw: string,
  expectedEventId: string
): UsgsFeature {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new VerificationError("verified payload is not valid JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new VerificationError("verified payload has an invalid shape");
  }
  const item = value as Record<string, unknown>;
  if (item.v !== 1 || item.id !== expectedEventId) {
    throw new VerificationError("verified payload identity does not match the request");
  }
  const alerts = ["green", "yellow", "orange", "red"];
  if (item.a !== null && (typeof item.a !== "string" || !alerts.includes(item.a))) {
    throw new VerificationError("verified payload has an invalid alert");
  }
  if (item.ts !== 0 && item.ts !== 1) {
    throw new VerificationError("verified payload has an invalid tsunami flag");
  }
  const payload: Payload = {
    v: 1,
    id: expectedEventId,
    m: nullableFinite(item.m, "magnitude"),
    lo: ranged(item.lo, "longitude", -180, 180),
    la: ranged(item.la, "latitude", -90, 90),
    d: ranged(item.d, "depth", -20, 1_000),
    t: ranged(item.t, "event time", 0, Number.MAX_SAFE_INTEGER),
    u: ranged(item.u, "update time", 0, Number.MAX_SAFE_INTEGER),
    ts: item.ts,
    a: item.a as Payload["a"],
    s: nullableFinite(item.s, "significance")
  };

  return {
    id: payload.id,
    type: "Feature",
    properties: {
      mag: payload.m,
      place: null,
      time: payload.t,
      updated: payload.u,
      url: `https://earthquake.usgs.gov/earthquakes/eventpage/${payload.id}`,
      detail: null,
      felt: null,
      cdi: null,
      mmi: null,
      alert: payload.a,
      status: "verified",
      tsunami: payload.ts,
      sig: payload.s,
      title: null
    },
    geometry: { type: "Point", coordinates: [payload.lo, payload.la, payload.d] }
  };
}
