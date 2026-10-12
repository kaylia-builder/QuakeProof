import { readFile } from "node:fs/promises";

import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const abi = parseAbi([
  "function sendVerification(string source, string eventId, uint64 subscriptionId, uint32 callbackGasLimit) external returns (bytes32)"
]);

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const rpcUrl = required("CHAINLINK_RPC_URL");
  const contract = required("CHAINLINK_CONSUMER_ADDRESS");
  const eventId = required("USGS_EVENT_ID");
  const privateKey = required("CHAINLINK_OWNER_PRIVATE_KEY");
  const subscriptionText = required("CHAINLINK_SUBSCRIPTION_ID");

  if (!/^https:\/\//.test(rpcUrl)) throw new Error("CHAINLINK_RPC_URL must use HTTPS");
  if (!/^0x[0-9a-fA-F]{40}$/.test(contract)) {
    throw new Error("CHAINLINK_CONSUMER_ADDRESS must be a 20-byte EVM address");
  }
  if (!/^[A-Za-z0-9_-]{3,40}$/.test(eventId)) {
    throw new Error("USGS_EVENT_ID contains unsupported characters");
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("CHAINLINK_OWNER_PRIVATE_KEY must be a 0x-prefixed private key");
  }
  if (!/^\d+$/.test(subscriptionText)) {
    throw new Error("CHAINLINK_SUBSCRIPTION_ID must be an integer");
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const transport = http(rpcUrl);
  const wallet = createWalletClient({ account, chain: baseSepolia, transport });
  const publicClient = createPublicClient({ chain: baseSepolia, transport });
  const source = await readFile(
    new URL("../chainlink/source/verify-earthquake.js", import.meta.url),
    "utf8"
  );
  const hash = await wallet.writeContract({
    address: contract as `0x${string}`,
    abi,
    functionName: "sendVerification",
    args: [source, eventId, BigInt(subscriptionText), 250_000]
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`request transaction reverted: ${hash}`);

  console.log(JSON.stringify({
    eventId,
    transaction: hash,
    explorer: `https://sepolia.basescan.org/tx/${hash}`,
    note: "Wait for the Functions fulfillment before reading the risk endpoint."
  }, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
