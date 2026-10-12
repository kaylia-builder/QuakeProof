import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  decodePaymentResponseHeader,
  wrapFetchWithPayment,
  x402Client
} from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

import { classifyPaymentFailure } from "../src/payment-evidence.js";
import { BASE_SEPOLIA_USDC } from "../src/payment.js";

const PAYMENT_NETWORK = BASE_SEPOLIA_USDC.network;
const PAYMENT_ASSET = BASE_SEPOLIA_USDC.assetAddress;
const PRICE_ATOMIC = "10000";

type Settlement = {
  success?: boolean;
  transaction?: string;
  network?: string;
  payer?: string;
  errorReason?: string;
  errorMessage?: string;
};

type Earthquake = { id?: string };
type EarthquakeList = { earthquakes?: Earthquake[] };

function requiredPrivateKey(): `0x${string}` {
  const value = process.env.TESTNET_PAYER_PRIVATE_KEY?.trim();
  if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(
      "TESTNET_PAYER_PRIVATE_KEY must be a 0x-prefixed private key for a dedicated Base Sepolia wallet"
    );
  }
  return value as `0x${string}`;
}

function baseUrl(): string {
  const configured = process.env.QUAKEPROOF_BASE_URL?.trim();
  if (!configured) {
    throw new Error("QUAKEPROOF_BASE_URL is required for a paid smoke test");
  }
  const value = configured.replace(/\/$/, "");
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("QUAKEPROOF_BASE_URL must use HTTPS");
  }
  return url.toString().replace(/\/$/, "");
}

async function paidJson<T>(
  paidFetch: typeof fetch,
  url: string
): Promise<{ body: T; settlement: Settlement }> {
  const response = await paidFetch(url, { method: "GET" });
  const raw = await response.text();
  const paymentResponse = response.headers.get("payment-response");
  const settlement = paymentResponse
    ? decodePaymentResponseHeader(paymentResponse) as Settlement
    : undefined;

  if (!response.ok) {
    const reason = settlement?.errorReason ?? settlement?.errorMessage ?? raw.slice(0, 500);
    throw new Error(`paid request failed (${response.status}): ${reason}`);
  }

  if (!settlement) {
    throw new Error("paid response is missing PAYMENT-RESPONSE settlement evidence");
  }

  if (settlement.success !== true || settlement.network !== PAYMENT_NETWORK) {
    throw new Error(`unexpected settlement: ${JSON.stringify(settlement)}`);
  }

  return { body: JSON.parse(raw) as T, settlement };
}

async function main() {
  const account = privateKeyToAccount(requiredPrivateKey());
  const origin = baseUrl();
  const client = new x402Client()
    .register(PAYMENT_NETWORK, new ExactEvmScheme(account))
    .setSpendControls({
      maxAmountPerPayment: "$0.01",
      allowedAssets: [
        {
          network: PAYMENT_NETWORK,
          asset: PAYMENT_ASSET,
          maxAmountPerPayment: PRICE_ATOMIC
        }
      ]
    });
  const paidFetch = wrapFetchWithPayment(fetch, client);

  const recentUrl = `${origin}/v1/earthquakes/recent?hours=24&minMagnitude=4.5&limit=3`;
  const nearbyUrl = `${origin}/v1/earthquakes/nearby?latitude=35.6762&longitude=139.6503&radiusKm=250&hours=168&minMagnitude=2.5&limit=3`;
  const outputPath = resolve(process.env.EVIDENCE_OUT ?? "testnet-paid-evidence.json");
  const calls: Array<{ endpoint: string; transaction?: string }> = [];
  let activeEndpoint = recentUrl;

  try {
    const recent = await paidJson<EarthquakeList>(paidFetch, recentUrl);
    calls.push({ endpoint: recentUrl, transaction: recent.settlement.transaction });

    activeEndpoint = nearbyUrl;
    const nearby = await paidJson<EarthquakeList>(paidFetch, nearbyUrl);
    calls.push({ endpoint: nearbyUrl, transaction: nearby.settlement.transaction });
    const eventId = recent.body.earthquakes?.[0]?.id ?? nearby.body.earthquakes?.[0]?.id;
    if (!eventId) {
      throw new Error("list endpoints returned no event id for the risk request");
    }

    activeEndpoint = `${origin}/v1/earthquakes/${encodeURIComponent(eventId)}/risk`;
    const risk = await paidJson<Record<string, unknown>>(paidFetch, activeEndpoint);
    calls.push({ endpoint: activeEndpoint, transaction: risk.settlement.transaction });
    const evidence = {
      verifiedAt: new Date().toISOString(),
      status: "success",
      service: origin,
      network: PAYMENT_NETWORK,
      asset: PAYMENT_ASSET,
      payer: account.address,
      calls
    };
    await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify({ ...evidence, evidenceFile: outputPath }, null, 2));
  } catch (error) {
    const failure = classifyPaymentFailure(error);
    const evidence = {
      verifiedAt: new Date().toISOString(),
      status: "failed",
      service: origin,
      network: PAYMENT_NETWORK,
      asset: PAYMENT_ASSET,
      payer: account.address,
      calls,
      failure: { endpoint: activeEndpoint, ...failure }
    };
    await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
    throw new Error(`paid smoke failed during ${failure.stage}: ${failure.reason}`);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
