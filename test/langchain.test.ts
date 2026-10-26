import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { BlockchainIQClient, createPayingFetch } from "../src/core/index.js";
import { createBlockchainIQTools } from "../src/langchain/index.js";
import { createFakeServer, FAKE_TX } from "./fake-x402-server.js";

describe("LangChain tools", () => {
  it("exposes two structured tools with stable names", () => {
    const client = new BlockchainIQClient({ payingFetch: fetch });
    const names = createBlockchainIQTools(client).map((t) => t.name);
    expect(names).toEqual(["blockchainiq_market_brief", "blockchainiq_event_risk"]);
  });

  it("brief tool invoke() pays and returns data plus the tx hash", async () => {
    const server = createFakeServer({ amount: "10000" });
    const client = new BlockchainIQClient({
      payingFetch: createPayingFetch(privateKeyToAccount(generatePrivateKey()), { fetchImpl: server.fetch }),
    });
    const [brief] = createBlockchainIQTools(client);
    const out = JSON.parse(await brief.invoke({}));
    expect(out.settlement.transaction).toBe(FAKE_TX);
    expect(out.data.asOf).toBeDefined();
  });

  it("event-risk tool validates its schema before paying", async () => {
    const server = createFakeServer({ amount: "50000" });
    const client = new BlockchainIQClient({
      payingFetch: createPayingFetch(privateKeyToAccount(generatePrivateKey()), { fetchImpl: server.fetch }),
    });
    const [, eventRisk] = createBlockchainIQTools(client);
    await expect(eventRisk.invoke({ days: 500 })).rejects.toThrow();
    expect(server.requests).toHaveLength(0);
    const out = JSON.parse(await eventRisk.invoke({ days: 3, minImportance: 3 }));
    expect(out.settlement.transaction).toBe(FAKE_TX);
  });
});
