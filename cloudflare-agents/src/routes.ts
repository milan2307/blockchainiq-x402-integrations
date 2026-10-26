/**
 * HTTP surface of the agent, as a pure function so it is testable without workerd:
 *   GET  /brief                         paid $0.01
 *   GET  /event-risk?days=&minImportance=  paid $0.05
 *   GET  /quote/brief | /quote/event-risk  free, reads the 402 price only
 * Responses are JSON. Errors never echo secrets.
 */
import type { BlockchainIQClient, EventRiskQuery } from "../../src/core/index.js";

export async function handleBlockchainIQRequest(request: Request, client: BlockchainIQClient): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  try {
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    if (path.endsWith("/quote/brief")) return json(await client.quote("brief"));
    if (path.endsWith("/quote/event-risk")) return json(await client.quote("eventRisk", eventRiskQuery(url)));
    if (path.endsWith("/brief")) return json(await client.getBrief());
    if (path.endsWith("/event-risk")) return json(await client.getEventRisk(eventRiskQuery(url)));
    return json({ error: "not_found", routes: ["/brief", "/event-risk", "/quote/brief", "/quote/event-risk"] }, 404);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "unknown_error" }, error instanceof RangeError ? 400 : 502);
  }
}

export function eventRiskQuery(url: URL): EventRiskQuery {
  const days = url.searchParams.get("days");
  const min = url.searchParams.get("minImportance");
  return {
    days: days === null ? undefined : Number(days),
    minImportance: min === null ? undefined : (Number(min) as EventRiskQuery["minImportance"]),
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
