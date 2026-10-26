import { appendFileSync } from "node:fs";
import { createPublicClient, erc20Abi, formatUnits, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import type { SettlementProof } from "../src/core/index.js";

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

/** Reads AGENT_PRIVATE_KEY (a dedicated, low-balance wallet). Never logs it. */
export function loadAgentAccount() {
  const key = process.env.AGENT_PRIVATE_KEY?.trim();
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error("Set AGENT_PRIVATE_KEY to a 0x-prefixed key of a dedicated wallet holding a little USDC on Base.");
  }
  return privateKeyToAccount(key as Hex);
}

/** Read-only balance check so an empty wallet fails clearly instead of mid-payment. */
export async function requireUsdc(address: Hex, minUsd: number): Promise<void> {
  const client = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL) });
  const raw = await client.readContract({ address: BASE_USDC, abi: erc20Abi, functionName: "balanceOf", args: [address] });
  const usd = Number(formatUnits(raw, 6));
  console.log(`payer ${address} holds ${usd} USDC on Base`);
  if (usd < minUsd) throw new Error(`payer needs at least ${minUsd} USDC on Base; it has ${usd}`);
}

/** Prints the settlement proof and, if PROOF_FILE is set, appends it as one JSON line. */
export function reportProof(framework: string, resource: string, settlement: SettlementProof | null | undefined): void {
  if (!settlement?.transaction) throw new Error("no PAYMENT-RESPONSE settlement proof returned");
  const record = { framework, resource, ...settlement, at: new Date().toISOString() };
  console.log("settlement proof:", record);
  console.log(`basescan: https://basescan.org/tx/${settlement.transaction}`);
  if (process.env.PROOF_FILE) appendFileSync(process.env.PROOF_FILE, JSON.stringify(record) + "\n");
}
