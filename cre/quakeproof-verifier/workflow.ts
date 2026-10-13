import {
  bytesToHex,
  consensusIdenticalAggregation,
  cre,
  decodeJson,
  getNetwork,
  json,
  ok,
  prepareReportRequest,
  TxStatus,
  type HTTPPayload,
  type HTTPSendRequester,
  type Runtime
} from "@chainlink/cre-sdk";
import { encodeAbiParameters, parseAbiParameters, type Address } from "viem";
import { z } from "zod";

import { canonicalizeUsgsEvent } from "./usgs.js";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

export const configSchema = z.object({
  chainSelectorName: z.literal("ethereum-testnet-sepolia-base-1"),
  consumerAddress: address,
  gasLimit: z.string().regex(/^[1-9][0-9]*$/),
  authorizedTriggerAddress: z.union([address, z.literal("")]),
  usgsQueryUrl: z.literal("https://earthquake.usgs.gov/fdsnws/event/1/query")
});

type Config = z.infer<typeof configSchema>;

function eventIdFromPayload(payload: HTTPPayload): string {
  const decoded = decodeJson(payload.input) as unknown;
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new Error("HTTP trigger input must be a JSON object");
  }
  const eventId = (decoded as Record<string, unknown>).eventId;
  if (typeof eventId !== "string" || !/^[A-Za-z0-9_-]{3,40}$/.test(eventId)) {
    throw new Error("HTTP trigger input has an invalid USGS eventId");
  }
  return eventId;
}

function fetchUsgsEvent(
  requester: HTTPSendRequester,
  queryUrl: string,
  eventId: string
): string {
  // The CRE Javy runtime intentionally exposes a smaller Web API surface than
  // Node.js. eventId is already restricted to URL-safe characters above, so a
  // deterministic query string avoids relying on the unavailable URL class.
  const url = `${queryUrl}?format=geojson&eventid=${eventId}`;
  const response = requester.sendRequest({ url, method: "GET" }).result();
  if (!ok(response)) {
    throw new Error(`USGS request failed with status ${response.statusCode}`);
  }
  return canonicalizeUsgsEvent(json(response), eventId);
}

export function verifyEarthquake(
  runtime: Runtime<Config>,
  triggerPayload: HTTPPayload
): string {
  const eventId = eventIdFromPayload(triggerPayload);
  const payload = new cre.capabilities.HTTPClient()
    .sendRequest(
      runtime,
      fetchUsgsEvent,
      consensusIdenticalAggregation<string>()
    )(runtime.config.usgsQueryUrl, eventId)
    .result();

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.chainSelectorName,
    isTestnet: true
  });
  if (!network) throw new Error(`Unsupported CRE network: ${runtime.config.chainSelectorName}`);

  const verifiedAt = BigInt(Math.floor(runtime.now().getTime() / 1000));
  const reportData = encodeAbiParameters(
    parseAbiParameters(
      "uint64 chainSelector, uint64 verifiedAt, string eventId, string payload"
    ),
    [network.chainSelector.selector, verifiedAt, eventId, payload]
  );
  const report = runtime.report(prepareReportRequest(reportData)).result();
  const result = new cre.capabilities.EVMClient(network.chainSelector.selector)
    .writeReport(runtime, {
      receiver: runtime.config.consumerAddress as Address,
      report,
      gasConfig: { gasLimit: runtime.config.gasLimit }
    })
    .result();

  if (result.txStatus !== TxStatus.SUCCESS) {
    throw new Error(`CRE report write failed: ${result.errorMessage || result.txStatus}`);
  }
  const transactionHash = bytesToHex(result.txHash || new Uint8Array(32));
  runtime.log(`Stored verified USGS event ${eventId}: ${transactionHash}`);
  return transactionHash;
}

export function initWorkflow(config: Config) {
  const authorizedKeys = config.authorizedTriggerAddress
    ? [{
        type: "KEY_TYPE_ECDSA_EVM" as const,
        publicKey: config.authorizedTriggerAddress
      }]
    : [];
  const trigger = new cre.capabilities.HTTPCapability().trigger({ authorizedKeys });
  return [cre.handler(trigger, verifyEarthquake)];
}
