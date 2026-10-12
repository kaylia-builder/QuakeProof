import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { decodePaymentRequiredHeader } from "@x402/core/http";

import {
  analyzeDiagnostics,
  sanitizeForReport
} from "../src/diagnostics.js";
import { DEFAULT_FACILITATOR_URL } from "../src/payment.js";


function httpsUrl(value: string, name: string): string {
  const url = new URL(value.replace(/\/$/, ""));
  if (url.protocol !== "https:") throw new Error(`${name} must use HTTPS`);
  return url.toString().replace(/\/$/, "");
}

async function request(url: string): Promise<{
  status: number;
  headers: Headers;
  body: unknown;
}> {
  const response = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000)
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Preserve a bounded response preview for diagnostics.
    body = text.slice(0, 500);
  }
  return { status: response.status, headers: response.headers, body };
}

async function main() {
  const configuredService = process.env.QUAKEPROOF_BASE_URL?.trim();
  if (!configuredService) {
    throw new Error("QUAKEPROOF_BASE_URL is required for facilitator diagnostics");
  }
  const service = httpsUrl(
    configuredService,
    "QUAKEPROOF_BASE_URL"
  );
  const facilitator = httpsUrl(
    process.env.FACILITATOR_URL ?? DEFAULT_FACILITATOR_URL,
    "FACILITATOR_URL"
  );
  const challengeUrl = `${service}/v1/earthquakes/recent?hours=24&minMagnitude=4.5&limit=3`;

  const [health, challenge, supported] = await Promise.all([
    request(`${service}/healthz`),
    request(challengeUrl),
    request(`${facilitator}/supported`)
  ]);
  const header = challenge.headers.get("payment-required");
  let paymentRequired: unknown;
  let challengeDecodeError: string | undefined;
  if (header) {
    try {
      paymentRequired = decodePaymentRequiredHeader(header);
    } catch (error) {
      challengeDecodeError = error instanceof Error ? error.message : String(error);
    }
  }

  const analysis = analyzeDiagnostics({
    healthStatus: health.status,
    challengeStatus: challenge.status,
    paymentRequired,
    supportedStatus: supported.status,
    supported: supported.body
  });
  const report = sanitizeForReport({
    generatedAt: new Date().toISOString(),
    mode: "read_only",
    warning: "This report does not sign a payment or prove settlement compatibility.",
    service,
    facilitator,
    runtime: { node: process.version },
    observations: {
      health: { status: health.status, body: health.body },
      challenge: {
        url: challengeUrl,
        status: challenge.status,
        paymentRequired,
        decodeError: challengeDecodeError
      },
      facilitatorSupported: { status: supported.status, body: supported.body }
    },
    ...analysis
  });

  const outputPath = resolve(process.env.DIAGNOSTIC_OUT ?? "facilitator-diagnostic.json");
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ ...report as object, reportFile: outputPath }, null, 2));
  if (analysis.outcome === "fail") process.exitCode = 1;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
