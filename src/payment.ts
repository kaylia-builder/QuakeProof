import type { AssetAmount, MoneyParser, Network } from "@x402/core/types";

export interface EvmPaymentConfig {
  network: Network;
  assetAddress: `0x${string}`;
  assetSymbol: string;
  assetDecimals: number;
  eip712Name: string;
  eip712Version: string;
}

export const BASE_SEPOLIA_USDC: EvmPaymentConfig = {
  network: "eip155:84532",
  assetAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  assetSymbol: "USDC",
  assetDecimals: 6,
  eip712Name: "USDC",
  eip712Version: "2"
};

export const DEFAULT_FACILITATOR_URL = "https://x402.org/facilitator";

export function assetMoneyParser(config: EvmPaymentConfig): MoneyParser {
  return async (amount: string | number, network: Network): Promise<AssetAmount | null> => {
    if (network !== config.network) return null;
    const text = typeof amount === "number"
      ? amount.toFixed(config.assetDecimals)
      : amount.trim().replace(/^\$/, "");
    if (!/^\d+(\.\d+)?$/.test(text) || Number(text) <= 0) {
      throw new Error(`price must be a positive decimal, got ${amount}`);
    }
    const [whole, fraction = ""] = text.split(".");
    if (fraction.length > config.assetDecimals) {
      throw new Error(
        `price ${text} has more than ${config.assetDecimals} decimals (${config.assetSymbol})`
      );
    }
    const units = BigInt(whole + fraction.padEnd(config.assetDecimals, "0"));
    if (units <= 0n) {
      throw new Error(`price ${amount} is below one unit of ${config.assetSymbol}`);
    }
    return {
      asset: config.assetAddress,
      amount: units.toString(),
      extra: { name: config.eip712Name, version: config.eip712Version }
    };
  };
}
