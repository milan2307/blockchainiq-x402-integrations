/**
 * One real paid call ($0.01) to Blockchain IQ `brief` through the Cloudflare Agents agent,
 * running locally in workerd via `wrangler dev --local` (no Cloudflare account needed).
 *   AGENT_PRIVATE_KEY=0x... npm run paid:cloudflare
 * The key goes to the Worker through a temporary 0600 env file that is deleted afterwards.
 */
import { appendFileSync } from "node:fs";
import { createPublicClient, erc20Abi, formatUnits, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { startWrangler } from "./wrangler-runner.mjs";

const key = process.env.AGENT_PRIVATE_KEY?.trim();
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
  console.error("Set AGENT_PRIVATE_KEY to a 0x-prefixed key of a dedicated wallet holding a little USDC on Base.");
  process.exit(1);
}
const payer = privateKeyToAccount(key).address;
const rpc = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL) });
const balance = Number(formatUnits(await rpc.readContract({
  address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", abi: erc20Abi, functionName: "balanceOf", args: [payer],
}), 6));
console.log(`payer ${payer} holds ${balance} USDC on Base`);
if (balance < 0.01) {
  console.error("payer needs at least 0.01 USDC on Base");
  process.exit(1);
}

const wrangler = await startWrangler({ vars: { AGENT_PRIVATE_KEY: key, MAX_USD_PER_CALL: "0.01" } });
try {
  const res = await fetch(`${wrangler.agentUrl}/brief`);
  const body = await res.json();
  if (!res.ok || !body.settlement?.transaction) throw new Error(`paid call failed: HTTP ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  console.log("brief data (first coins):", JSON.stringify(body.data?.coins?.slice(0, 2) ?? body.data).slice(0, 400));
  const record = { framework: "cloudflare-agents", resource: "brief", ...body.settlement, at: new Date().toISOString() };
  console.log("settlement proof:", record);
  console.log(`basescan: https://basescan.org/tx/${body.settlement.transaction}`);
  if (process.env.PROOF_FILE) appendFileSync(process.env.PROOF_FILE, JSON.stringify(record) + "\n");
} finally {
  wrangler.stop();
}
