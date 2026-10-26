import { Agent, callable } from "agents";
import { formatToolResult } from "../../src/core/index.js";
import { handleBlockchainIQRequest } from "./routes.js";
import { createServiceClient, type BlockchainIQEnv } from "./service.js";

export type Env = BlockchainIQEnv & { BlockchainIqAgent: DurableObjectNamespace<BlockchainIqAgent> };

/**
 * Cloudflare Agents SDK agent for Blockchain IQ's x402 API.
 * - HTTP:  /agents/blockchain-iq-agent/<name>/brief, /event-risk, /quote/...
 * - RPC:   agent.call("getMarketBrief") / agent.call("getEventRisk", [{ days: 7 }]) from agents/client
 * Payments use the AGENT_PRIVATE_KEY secret, are capped by MAX_USD_PER_CALL,
 * Base mainnet only, and only to Blockchain IQ's payee.
 */
export class BlockchainIqAgent extends Agent<Env> {
  async onRequest(request: Request): Promise<Response> {
    return handleBlockchainIQRequest(request, createServiceClient(this.env));
  }

  @callable({ description: "Paid $0.01: Blockchain IQ market brief, with settlement tx hash" })
  async getMarketBrief(): Promise<string> {
    return formatToolResult(await createServiceClient(this.env).getBrief());
  }

  @callable({ description: "Paid $0.05: Blockchain IQ event risk, with settlement tx hash" })
  async getEventRisk(query: { days?: number; minImportance?: 1 | 2 | 3 } = {}): Promise<string> {
    return formatToolResult(await createServiceClient(this.env).getEventRisk(query));
  }
}
