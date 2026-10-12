import { afterEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "../src/config.js";
import { BASE_SEPOLIA_USDC, assetMoneyParser } from "../src/payment.js";

afterEach(() => vi.unstubAllEnvs());

describe("EVM payment configuration", () => {
  it("uses Base Sepolia USDC by default", () => {
    expect(BASE_SEPOLIA_USDC).toMatchObject({
      network: "eip155:84532",
      assetAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      assetSymbol: "USDC",
      assetDecimals: 6,
      eip712Name: "USDC",
      eip712Version: "2"
    });
  });

  it("converts decimal prices without floating-point rounding", async () => {
    await expect(
      assetMoneyParser(BASE_SEPOLIA_USDC)("0.01", BASE_SEPOLIA_USDC.network)
    ).resolves.toMatchObject({
      amount: "10000",
      asset: BASE_SEPOLIA_USDC.assetAddress,
      extra: { name: "USDC", version: "2" }
    });
  });

  it("rejects the wrong network and over-precise prices", async () => {
    await expect(
      assetMoneyParser(BASE_SEPOLIA_USDC)("0.01", "eip155:1")
    ).resolves.toBeNull();
    await expect(
      assetMoneyParser(BASE_SEPOLIA_USDC)("0.0000001", BASE_SEPOLIA_USDC.network)
    ).rejects.toThrow(/more than 6 decimals/);
  });

  it("loads Base Sepolia defaults when no custom asset is configured", () => {
    vi.stubEnv("PAY_TO", "0x1111111111111111111111111111111111111111");
    expect(loadConfig().payment).toEqual(BASE_SEPOLIA_USDC);
  });

  it("rejects partial custom asset configuration", () => {
    vi.stubEnv("PAY_TO", "0x1111111111111111111111111111111111111111");
    vi.stubEnv("X402_NETWORK", "eip155:1");
    expect(() => loadConfig()).toThrow(/custom x402 asset configuration is missing/);
  });

  it("requires both Chainlink RPC and consumer address", () => {
    vi.stubEnv("PAY_TO", "0x1111111111111111111111111111111111111111");
    vi.stubEnv("CHAINLINK_RPC_URL", "https://sepolia.base.org");
    expect(() => loadConfig()).toThrow(/must be set together/);
  });
});
