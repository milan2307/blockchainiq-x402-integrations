/**
 * One real paid call ($0.01) to Blockchain IQ `brief` through the LangChain tool.
 *   AGENT_PRIVATE_KEY=0x... npm run paid:langchain
 * No LLM key is needed: the tool is invoked directly, exactly as an agent would call it.
 */
import { BlockchainIQClient, createPayingFetch } from "../src/core/index.js";
import { createBlockchainIQBriefTool } from "../src/langchain/index.js";
import { loadAgentAccount, reportProof, requireUsdc } from "./shared.js";

const account = loadAgentAccount();
await requireUsdc(account.address, 0.01);

const client = new BlockchainIQClient({ payingFetch: createPayingFetch(account, { maxUsdPerCall: 0.01 }) });
const briefTool = createBlockchainIQBriefTool(client);

const output = JSON.parse(await briefTool.invoke({}));
console.log("brief data (first coins):", JSON.stringify(output.data?.coins?.slice(0, 2) ?? output.data).slice(0, 400));
reportProof("langchain", "brief", output.settlement);
