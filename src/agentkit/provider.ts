import "reflect-metadata";
import { ActionProvider, CreateAction, EvmWalletProvider, type Network } from "@coinbase/agentkit";
import { z } from "zod";
import { BlockchainIQClient } from "../core/client.js";
import { createPayingFetch, DEFAULT_MAX_USD_PER_CALL } from "../core/payment.js";
import { formatToolResult } from "../core/format.js";
import type { PaidResult } from "../core/client.js";

export const BriefSchema = z.object({}).describe("No parameters");

export const EventRiskSchema = z.object({
  days: z.number().int().min(1).max(90).optional().describe("Window length in days, 1-90 (default 7)"),
  minImportance: z
    .union([z.literal(1), z.literal(2), z.literal(3)])
    .optional()
    .describe("Lowest importance to include, 1-3 (default 1)"),
});

export interface BlockchainIQActionProviderConfig {
  /** Refuse any single payment above this many US dollars (default 0.06). */
  maxUsdPerCall?: number;
  /** Override for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Coinbase AgentKit action provider for Blockchain IQ's x402 API.
 * Payments are signed by the agent's own EVM wallet provider, on Base mainnet only.
 */
export class BlockchainIQActionProvider extends ActionProvider<EvmWalletProvider> {
  private readonly maxUsdPerCall: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: BlockchainIQActionProviderConfig = {}) {
    super("blockchainiq", []);
    this.maxUsdPerCall = config.maxUsdPerCall ?? DEFAULT_MAX_USD_PER_CALL;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  @CreateAction({
    name: "get_market_brief",
    description:
      "Paid ($0.01 USDC on Base via x402). Blockchain IQ market brief: BTC, ETH, SOL and XRP prices with 24h/7d/30d moves, " +
      "scheduled events in the next 48 hours and short risk flags. Returns JSON with the data and the settlement transaction hash.",
    schema: BriefSchema,
  })
  async getMarketBrief(walletProvider: EvmWalletProvider, _args: z.infer<typeof BriefSchema>): Promise<string> {
    return this.run(walletProvider, (client) => client.getBrief());
  }

  @CreateAction({
    name: "get_event_risk",
    description:
      "Paid ($0.05 USDC on Base via x402). Blockchain IQ event risk: scheduled market-moving events for the next N days " +
      "(default 7) with importance 1-3 and official sources. Returns JSON with the data and the settlement transaction hash.",
    schema: EventRiskSchema,
  })
  async getEventRisk(walletProvider: EvmWalletProvider, args: z.infer<typeof EventRiskSchema>): Promise<string> {
    return this.run(walletProvider, (client) => client.getEventRisk(args));
  }

  /** Blockchain IQ settles on Base mainnet only. */
  supportsNetwork = (network: Network): boolean =>
    network.protocolFamily === "evm" && (network.networkId === "base-mainnet" || network.chainId === "8453");

  private async run(
    walletProvider: EvmWalletProvider,
    call: (client: BlockchainIQClient) => Promise<PaidResult>,
  ): Promise<string> {
    try {
      const payingFetch = createPayingFetch(walletProvider.toSigner(), {
        maxUsdPerCall: this.maxUsdPerCall,
        fetchImpl: this.fetchImpl,
      });
      const client = new BlockchainIQClient({ payingFetch, plainFetch: this.fetchImpl });
      return formatToolResult(await call(client));
    } catch (error) {
      return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
    }
  }
}

export const blockchainIQActionProvider = (config?: BlockchainIQActionProviderConfig) =>
  new BlockchainIQActionProvider(config);
