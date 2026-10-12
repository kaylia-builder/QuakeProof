import { readFile } from "node:fs/promises";

import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  stringToHex,
  toBytes,
  type Abi,
  type Hex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const FUNCTIONS_ROUTER = "0xf9B8fc078197181C841c296C876945aaa425B278";
const DON_ID = stringToHex("fun-base-sepolia-1", { size: 32 });

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const rpcUrl = required("CHAINLINK_RPC_URL");
  const privateKey = required("CHAINLINK_OWNER_PRIVATE_KEY");
  if (!/^https:\/\//.test(rpcUrl)) throw new Error("CHAINLINK_RPC_URL must use HTTPS");
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("CHAINLINK_OWNER_PRIVATE_KEY must be a 0x-prefixed private key");
  }

  const artifactPath = new URL(
    "../contracts/out/QuakeProofFunctionsConsumer.sol/QuakeProofFunctionsConsumer.json",
    import.meta.url
  );
  let artifact: { abi: Abi; bytecode: { object: Hex } };
  try {
    artifact = JSON.parse(await readFile(artifactPath, "utf8")) as typeof artifact;
  } catch {
    throw new Error("consumer artifact is missing; run npm run build:contracts first");
  }
  if (!artifact.bytecode?.object?.startsWith("0x")) {
    throw new Error("consumer artifact does not contain deployable bytecode");
  }
  const source = await readFile(
    new URL("../chainlink/source/verify-earthquake.js", import.meta.url),
    "utf8"
  );
  const sourceHash = keccak256(toBytes(source));

  const account = privateKeyToAccount(privateKey as Hex);
  const transport = http(rpcUrl);
  const wallet = createWalletClient({ account, chain: baseSepolia, transport });
  const publicClient = createPublicClient({ chain: baseSepolia, transport });
  const hash = await wallet.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    args: [FUNCTIONS_ROUTER, DON_ID, sourceHash]
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) {
    throw new Error(`consumer deployment reverted: ${hash}`);
  }

  console.log(JSON.stringify({
    owner: account.address,
    contract: receipt.contractAddress,
    sourceHash,
    transaction: hash,
    explorer: `https://sepolia.basescan.org/address/${receipt.contractAddress}`,
    next: "Add the contract as an authorized consumer on your Functions subscription."
  }, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
