import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { BlockchainIQClient } from "../core/client.js";
import { formatToolResult } from "../core/format.js";

const eventRiskSchema = z.object({
  days: z.number().int().min(1).max(90).optional().describe("Window length in days, 1-90 (default 7)"),
  minImportance: z
    .union([z.literal(1), z.literal(2), z.literal(3)])
    .optional()
    .describe("Lowest importance to include, 1-3 (default 1 = everything)"),
});

/** LangChain tool: Blockchain IQ market brief, $0.01 per call in USDC on Base. */
export function createBlockchainIQBriefTool(client: BlockchainIQClient) {
  return tool(async () => formatToolResult(await client.getBrief()), {
    name: "blockchainiq_market_brief",
    description:
      "Paid ($0.01 USDC on Base via x402). Returns BTC, ETH, SOL and XRP prices with 24h/7d/30d moves, " +
      "scheduled macro and crypto events in the next 48 hours, and short risk flags. Market data for research, not advice.",
    schema: z.object({}),
  });
}

/** LangChain tool: Blockchain IQ event risk, $0.05 per call in USDC on Base. */
export function createBlockchainIQEventRiskTool(client: BlockchainIQClient) {
  return tool(async (args) => formatToolResult(await client.getEventRisk(args)), {
    name: "blockchainiq_event_risk",
    description:
      "Paid ($0.05 USDC on Base via x402). Lists scheduled market-moving events (US data releases, FOMC/ECB/BoJ decisions, " +
      "Treasury auctions, dated crypto and regulatory milestones) for the next N days, each with importance 1-3 and its official source.",
    schema: eventRiskSchema,
  });
}

/** Both tools, ready to pass to a LangChain agent or model.bindTools(). */
export function createBlockchainIQTools(client: BlockchainIQClient) {
  return [createBlockchainIQBriefTool(client), createBlockchainIQEventRiskTool(client)] as const;
}
