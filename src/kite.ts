/*
 * Derived from gokite-ai/kite-x402-services/templates/typescript-express/src/kite.ts
 * under Apache-2.0. Modified for QuakeProof's application structure and tests.
 */
import type { AssetAmount, MoneyParser, Network } from "@x402/core/types";

export interface KiteChain {
  network: Network;
  rpcUrl: string;
  assetAddress: string;
  assetSymbol: string;
  assetDecimals: number;
  eip712Name: string;
  eip712Version: string;
}

export const KITE_MAINNET: KiteChain = {
  network: "eip155:2366",
  rpcUrl: "https://rpc.gokite.ai",
  assetAddress: "0x7aB6f3ed87C42eF0aDb67Ed95090f8bF5240149e",
  assetSymbol: "USDC.e",
  assetDecimals: 6,
  eip712Name: "Bridged USDC (Kite AI)",
  eip712Version: "2"
};

export const KITE_TESTNET: KiteChain = {
  network: "eip155:2368",
  rpcUrl: "https://rpc-testnet.gokite.ai",
  assetAddress: "0x8E04D099b1a8Dd20E6caD4b2Ab2B405B98242ec9",
  assetSymbol: "PYUSD",
  assetDecimals: 18,
  eip712Name: "PYUSD",
  eip712Version: "1"
};

export const FACILITATOR_URL = "https://facilitator.pieverse.io/v2";

export function kiteChainByName(name: string | undefined): KiteChain {
  switch ((name ?? "mainnet").trim()) {
    case "":
    case "mainnet":
      return KITE_MAINNET;
    case "testnet":
      return KITE_TESTNET;
    default:
      throw new Error(`unknown KITE_NETWORK "${name}" (want mainnet or testnet)`);
  }
}

export function kiteMoneyParser(chain: KiteChain): MoneyParser {
  return async (amount: string | number, network: Network): Promise<AssetAmount | null> => {
    if (network !== chain.network) return null;
    const text = typeof amount === "number"
      ? amount.toFixed(chain.assetDecimals)
      : amount.trim().replace(/^\$/, "");
    if (!/^\d+(\.\d+)?$/.test(text) || Number(text) <= 0) {
      throw new Error(`price must be a positive decimal, got ${amount}`);
    }
    const [whole, frac = ""] = text.split(".");
    if (frac.length > chain.assetDecimals) {
      throw new Error(`price ${text} has more than ${chain.assetDecimals} decimals (${chain.assetSymbol})`);
    }
    const units = BigInt(whole + frac.padEnd(chain.assetDecimals, "0"));
    if (units <= 0n) throw new Error(`price ${amount} is below one unit of ${chain.assetSymbol}`);
    return {
      asset: chain.assetAddress,
      amount: units.toString(),
      extra: { name: chain.eip712Name, version: chain.eip712Version }
    };
  };
}
