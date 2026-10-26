/**
 * One real paid call ($0.01) to Blockchain IQ `brief` through the AgentKit action provider.
 *   AGENT_PRIVATE_KEY=0x... npm run paid:agentkit
 * Uses AgentKit's ViemWalletProvider on Base mainnet; no CDP API keys are required.
 */
import { AgentKit, ViemWalletProvider } from "@coinbase/agentkit";
import { createWalletClient, http } from "viem";
import { base } from "viem/chains";
import { blockchainIQActionProvider, ignoreAgentKitAnalyticsFailures } from "../src/agentkit/index.js";
import { loadAgentAccount, reportProof, requireUsdc } from "./shared.js";

ignoreAgentKitAnalyticsFailures(); // see src/agentkit/analytics-guard.ts

const account = loadAgentAccount();
await requireUsdc(account.address, 0.01);

const walletProvider = new ViemWalletProvider(
  createWalletClient({ account, chain: base, transport: http(process.env.BASE_RPC_URL) }),
);
const agentKit = await AgentKit.from({
  walletProvider,
  actionProviders: [blockchainIQActionProvider({ maxUsdPerCall: 0.01 })],
});

const brief = agentKit.getActions().find((a) => a.name.endsWith("get_market_brief"));
if (!brief) throw new Error("get_market_brief action not registered");

const output = JSON.parse(await brief.invoke({}));
if (output.error) throw new Error(output.error);
console.log("brief data (first coins):", JSON.stringify(output.data?.coins?.slice(0, 2) ?? output.data).slice(0, 400));
reportProof("agentkit", "brief", output.settlement);
