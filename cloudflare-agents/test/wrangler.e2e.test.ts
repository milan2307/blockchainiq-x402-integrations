/**
 * Opt-in (E2E_WRANGLER=1): runs the real Worker + Durable Object agent in workerd via
 * `wrangler dev --local`, pointed at an in-process fake x402 server on 127.0.0.1.
 * A throwaway key signs; the fake server verifies the signature; nothing is broadcast.
 */
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { AgentClient } from "agents/client";
import { createFakeServer, FAKE_TX } from "../../test/fake-x402-server.js";
// @ts-expect-error plain .mjs helper
import { startWrangler } from "../scripts/wrangler-runner.mjs";

const enabled = process.env.E2E_WRANGLER === "1";

describe.skipIf(!enabled)("Cloudflare agent in workerd (wrangler dev --local)", () => {
  const key = generatePrivateKey();
  const fake = createFakeServer({ amount: (url) => (url.includes("event-risk") ? "50000" : "10000") });
  let http: Server;
  let wrangler: { agentUrl: string; stop: () => void };

  beforeAll(async () => {
    http = createServer(async (req, res) => {
      const response = await fake.fetch(new Request(`http://${req.headers.host}${req.url}`, { headers: req.headers as HeadersInit }));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
    });
    await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
    const port = (http.address() as { port: number }).port;
    wrangler = await startWrangler({ vars: { AGENT_PRIVATE_KEY: key, BIQ_BASE_URL: `http://127.0.0.1:${port}`, MAX_USD_PER_CALL: "0.01" } });
  }, 90_000);

  afterAll(() => {
    wrangler?.stop();
    http?.close();
  });

  it("GET /brief through the agent signs a valid payment and returns the receipt", async () => {
    const res = await fetch(`${wrangler.agentUrl}/brief`);
    const body = (await res.json()) as { settlement?: { transaction: string; payer: string }; error?: string };
    expect(body.error).toBeUndefined();
    expect(body.settlement?.transaction).toBe(FAKE_TX);
    expect(fake.verifiedPayers).toEqual([privateKeyToAccount(key).address]);
  }, 30_000);

  it("@callable getMarketBrief over the Agents RPC (WebSocket) pays and returns the receipt", async () => {
    const client = new AgentClient({ agent: "blockchain-iq-agent", name: "default", host: new URL(wrangler.agentUrl).host, protocol: "ws" });
    await new Promise((resolve, reject) => {
      client.addEventListener("open", resolve);
      setTimeout(() => reject(new Error("websocket did not open")), 15_000);
    });
    const out = JSON.parse((await client.call("getMarketBrief")) as string);
    client.close();
    expect(out.settlement.transaction).toBe(FAKE_TX);
    expect(fake.verifiedPayers).toHaveLength(2);
  }, 30_000);

  it("the $0.01 cap set via env refuses event-risk ($0.05) inside the Worker", async () => {
    const before = fake.requests.length;
    const res = await fetch(`${wrangler.agentUrl}/event-risk`);
    expect(res.status).toBe(502);
    expect(fake.requests.slice(before).some((r) => r.paid)).toBe(false);
  }, 30_000);
});
