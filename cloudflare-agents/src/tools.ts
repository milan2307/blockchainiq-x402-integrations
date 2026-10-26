/**
 * AI SDK tools for an AIChatAgent (or any Agents SDK agent that runs a model):
 *   tools: createBlockchainIQAiTools(createServiceClient(this.env))
 */
import { tool } from "ai";
import { z } from "zod";
import { formatToolResult, type BlockchainIQClient } from "../../src/core/index.js";

export function createBlockchainIQAiTools(client: BlockchainIQClient) {
  return {
    blockchainiq_market_brief: tool({
      description:
        "Paid ($0.01 USDC on Base via x402). BTC, ETH, SOL and XRP prices with 24h/7d/30d moves, events in the next 48 hours and short risk flags. Market data for research, not advice.",
      inputSchema: z.object({}),
      execute: async () => formatToolResult(await client.getBrief()),
    }),
    blockchainiq_event_risk: tool({
      description:
        "Paid ($0.05 USDC on Base via x402). Scheduled market-moving events for the next N days with importance 1-3 and official sources.",
      inputSchema: z.object({
        days: z.number().int().min(1).max(90).optional(),
        minImportance: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
      }),
      execute: async (args) => formatToolResult(await client.getEventRisk(args)),
    }),
  };
}
