import { readFile } from "node:fs/promises";

import {
  createPublicClient,
  createWalletClient,
  http,
  type Abi,
  type Hex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const BASE_SEPOLIA_CHAIN_SELECTOR = 10_344_971_235_874_465_080n;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function address(name: string): `0x${string}` {
  const value = required(name);
  if (!/^0x[0-9a-fA-F]{40}$/.test(value) || /^0x0{40}$/i.test(value)) {
    throw new Error(`${name} must be a nonzero 20-byte EVM address`);
  }
  return value as `0x${string}`;
}

async function main() {
  const rpcUrl = required("CHAINLINK_RPC_URL");
  const privateKey = required("CHAINLINK_OWNER_PRIVATE_KEY");
  const forwarder = address("CRE_FORWARDER_ADDRESS");
  const workflowAuthor = address("CRE_WORKFLOW_AUTHOR_ADDRESS");
  if (!/^https:\/\//.test(rpcUrl)) throw new Error("CHAINLINK_RPC_URL must use HTTPS");
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("CHAINLINK_OWNER_PRIVATE_KEY must be a 0x-prefixed private key");
  }

  const artifactPath = new URL(
    "../contracts/out/QuakeProofReceiver.sol/QuakeProofReceiver.json",
    import.meta.url
  );
  let artifact: { abi: Abi; bytecode: { object: Hex } };
  try {
    artifact = JSON.parse(await readFile(artifactPath, "utf8")) as typeof artifact;
  } catch {
    throw new Error("receiver artifact is missing; run npm run build:contracts first");
  }
  if (!artifact.bytecode?.object?.startsWith("0x")) {
    throw new Error("receiver artifact does not contain deployable bytecode");
  }

  const account = privateKeyToAccount(privateKey as Hex);
  const transport = http(rpcUrl);
  const wallet = createWalletClient({ account, chain: baseSepolia, transport });
  const publicClient = createPublicClient({ chain: baseSepolia, transport });
  const hash = await wallet.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    args: [forwarder, workflowAuthor, BASE_SEPOLIA_CHAIN_SELECTOR]
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) {
    throw new Error(`receiver deployment reverted: ${hash}`);
  }

  console.log(JSON.stringify({
    owner: account.address,
    workflowAuthor,
    forwarder,
    contract: receipt.contractAddress,
    transaction: hash,
    explorer: `https://sepolia.basescan.org/address/${receipt.contractAddress}`,
    next: "Put this address in the CRE config that uses this forwarder. Set CHAINLINK_CONSUMER_ADDRESS only for the matching deployed environment."
  }, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
