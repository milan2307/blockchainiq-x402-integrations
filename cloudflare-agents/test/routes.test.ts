import { describe, expect, it } from "vitest";
import { generatePrivateKey } from "viem/accounts";
import { createFakeServer, FAKE_TX, LIVE_PAY_TO } from "../../test/fake-x402-server.js";
import { handleBlockchainIQRequest } from "../src/routes.js";
import { createServiceClient } from "../src/service.js";
import { createBlockchainIQAiTools } from "../src/tools.js";

const KEY = generatePrivateKey();
const get = (path: string) => new Request(`https://agent.local/agents/blockchain-iq-agent/default${path}`);

describe("Cloudflare agent routes (fake x402 server, nothing broadcast)", () => {
  it("GET /brief pays $0.01 with a verified signature and returns the tx hash", async () => {
    const server = createFakeServer({ amount: "10000" });
    const res = await handleBlockchainIQRequest(get("/brief"), createServiceClient({ AGENT_PRIVATE_KEY: KEY }, { fetchImpl: server.fetch }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { settlement: { transaction: string } };
    expect(body.settlement.transaction).toBe(FAKE_TX);
    expect(server.verifiedPayers).toHaveLength(1);
  });

  it("GET /event-risk passes days/minImportance and pays $0.05", async () => {
    const server = createFakeServer({ amount: "50000" });
    const res = await handleBlockchainIQRequest(
      get("/event-risk?days=3&minImportance=2"),
      createServiceClient({ AGENT_PRIVATE_KEY: KEY }, { fetchImpl: server.fetch }),
    );
    const body = (await res.json()) as { url: string; settlement: { transaction: string } };
    expect(body.url).toContain("event-risk?days=3&minImportance=2");
    expect(body.settlement.transaction).toBe(FAKE_TX);
  });

  it("rejects bad parameters with 400 before any request", async () => {
    const server = createFakeServer();
    const res = await handleBlockchainIQRequest(get("/event-risk?days=500"), createServiceClient({ AGENT_PRIVATE_KEY: KEY }, { fetchImpl: server.fetch }));
    expect(res.status).toBe(400);
    expect(server.requests).toHaveLength(0);
  });

  it("GET /quote/brief reads the 402 price without a key and without paying", async () => {
    const server = createFakeServer({ amount: "10000" });
    const res = await handleBlockchainIQRequest(get("/quote/brief"), createServiceClient({}, { fetchImpl: server.fetch }));
    expect(await res.json()).toMatchObject({ usd: 0.01, payTo: LIVE_PAY_TO, network: "eip155:8453" });
    expect(server.requests.every((r) => !r.paid)).toBe(true);
  });

  it("a paid route without the secret fails clearly and never leaks env", async () => {
    const res = await handleBlockchainIQRequest(get("/brief"), createServiceClient({}, { fetchImpl: createFakeServer().fetch }));
    expect(res.status).toBe(502);
    expect(await res.text()).toMatch(/AGENT_PRIVATE_KEY is not set/);
  });

  it("MAX_USD_PER_CALL caps the price: a $0.05 call is refused at 0.01", async () => {
    const server = createFakeServer({ amount: "50000" });
    const res = await handleBlockchainIQRequest(
      get("/event-risk"),
      createServiceClient({ AGENT_PRIVATE_KEY: KEY, MAX_USD_PER_CALL: "0.01" }, { fetchImpl: server.fetch }),
    );
    expect(res.status).toBe(502);
    expect(server.requests.some((r) => r.paid)).toBe(false);
  });

  it("rejects malformed keys and absurd caps at construction", () => {
    expect(() => createServiceClient({ AGENT_PRIVATE_KEY: "nope" })).toThrow(/0x-prefixed/);
    expect(() => createServiceClient({ AGENT_PRIVATE_KEY: KEY, MAX_USD_PER_CALL: "5" })).toThrow(/at most 0.5/);
  });

  it("unknown paths return 404 with the route list", async () => {
    const res = await handleBlockchainIQRequest(get("/nope"), createServiceClient({}));
    expect(res.status).toBe(404);
  });
});

describe("AI SDK tools for AIChatAgent", () => {
  it("market brief tool executes a paid call", async () => {
    const server = createFakeServer({ amount: "10000" });
    const tools = createBlockchainIQAiTools(createServiceClient({ AGENT_PRIVATE_KEY: KEY }, { fetchImpl: server.fetch }));
    const out = JSON.parse((await tools.blockchainiq_market_brief.execute!({}, { toolCallId: "t1", messages: [] })) as string);
    expect(out.settlement.transaction).toBe(FAKE_TX);
  });
});
