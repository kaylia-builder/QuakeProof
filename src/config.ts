import {
  BASE_SEPOLIA_USDC,
  DEFAULT_FACILITATOR_URL,
  type EvmPaymentConfig
} from "./payment.js";

export interface AppConfig {
  payTo: string;
  payment: EvmPaymentConfig;
  price: string;
  facilitatorUrl: string;
  upstreamUrl: URL;
  upstreamTimeoutMs: number;
  serviceDescription: string;
  chainlink?: {
    rpcUrl: string;
    consumerAddress: `0x${string}`;
    maxAgeSeconds: number;
  };
}

const env = (key: string, fallback = ""): string =>
  (process.env[key] ?? "").trim() || fallback;

function positiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function assetDecimals(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 255) {
    throw new Error("X402_ASSET_DECIMALS must be an integer between 0 and 255");
  }
  return parsed;
}

function paymentConfig(): EvmPaymentConfig {
  const keys = [
    "X402_NETWORK",
    "X402_ASSET_ADDRESS",
    "X402_ASSET_SYMBOL",
    "X402_ASSET_DECIMALS",
    "X402_EIP712_NAME",
    "X402_EIP712_VERSION"
  ] as const;
  const values = Object.fromEntries(
    keys.map(key => [key, (process.env[key] ?? "").trim()])
  ) as Record<(typeof keys)[number], string>;
  const supplied = keys.filter(key => values[key] !== "");
  if (supplied.length === 0) return { ...BASE_SEPOLIA_USDC };
  if (supplied.length !== keys.length) {
    const missing = keys.filter(key => values[key] === "");
    throw new Error(`custom x402 asset configuration is missing: ${missing.join(", ")}`);
  }

  const network = values.X402_NETWORK;
  if (!/^eip155:[1-9][0-9]*$/.test(network)) {
    throw new Error("X402_NETWORK must be a CAIP-2 EVM identifier such as eip155:84532");
  }

  const assetAddress = values.X402_ASSET_ADDRESS;
  if (!/^0x[0-9a-fA-F]{40}$/.test(assetAddress)) {
    throw new Error("X402_ASSET_ADDRESS must be a 20-byte EVM address");
  }

  return {
    network: network as EvmPaymentConfig["network"],
    assetAddress: assetAddress as `0x${string}`,
    assetSymbol: values.X402_ASSET_SYMBOL,
    assetDecimals: assetDecimals(values.X402_ASSET_DECIMALS),
    eip712Name: values.X402_EIP712_NAME,
    eip712Version: values.X402_EIP712_VERSION
  };
}

function chainlinkConfig(): AppConfig["chainlink"] {
  const rpcUrl = env("CHAINLINK_RPC_URL");
  const consumerAddress = env("CHAINLINK_CONSUMER_ADDRESS");
  if (!rpcUrl && !consumerAddress) return undefined;
  if (!rpcUrl || !consumerAddress) {
    throw new Error("CHAINLINK_RPC_URL and CHAINLINK_CONSUMER_ADDRESS must be set together");
  }
  const parsedRpcUrl = new URL(rpcUrl);
  if (parsedRpcUrl.protocol !== "https:") {
    throw new Error("CHAINLINK_RPC_URL must use https");
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(consumerAddress)) {
    throw new Error("CHAINLINK_CONSUMER_ADDRESS must be a 20-byte EVM address");
  }
  return {
    rpcUrl: parsedRpcUrl.toString(),
    consumerAddress: consumerAddress as `0x${string}`,
    maxAgeSeconds: positiveInteger(
      env("CHAINLINK_MAX_AGE_SECONDS", "86400"),
      "CHAINLINK_MAX_AGE_SECONDS"
    )
  };
}

export function loadConfig(): AppConfig {
  const payTo = env("PAY_TO");
  if (!/^0x[0-9a-fA-F]{40}$/.test(payTo)) {
    throw new Error("PAY_TO is required and must be a 20-byte EVM address");
  }

  const upstreamUrl = new URL(
    env("UPSTREAM_URL", "https://earthquake.usgs.gov/fdsnws/event/1/")
  );
  if (upstreamUrl.protocol !== "https:") {
    throw new Error("UPSTREAM_URL must use https");
  }

  const priceRaw = env("PRICE_USD", "0.01");
  if (!/^\d+(\.\d{1,6})?$/.test(priceRaw) || Number(priceRaw) <= 0) {
    throw new Error("PRICE_USD must be a positive decimal with at most 6 fractional digits");
  }

  return {
    payTo,
    payment: paymentConfig(),
    price: `$${priceRaw}`,
    facilitatorUrl: env("FACILITATOR_URL", DEFAULT_FACILITATOR_URL),
    upstreamUrl,
    upstreamTimeoutMs: positiveInteger(env("UPSTREAM_TIMEOUT_MS", "8000"), "UPSTREAM_TIMEOUT_MS"),
    serviceDescription: env(
      "SERVICE_DESCRIPTION",
      "Agent-ready earthquake intelligence from the USGS catalog"
    ),
    chainlink: chainlinkConfig()
  };
}
