import { routeAgentRequest } from "agents";
import type { Env } from "./agent.js";

export { BlockchainIqAgent } from "./agent.js";
export { createBlockchainIQAiTools } from "./tools.js";
export { createServiceClient } from "./service.js";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (
      (await routeAgentRequest(request, env)) ??
      new Response(JSON.stringify({ error: "not_found", hint: "GET /agents/blockchain-iq-agent/default/quote/brief" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      })
    );
  },
} satisfies ExportedHandler<Env>;
