/** Opt-in (LIVE_402=1): unpaid GETs to the live API through the agent's routes. No key, nothing paid. */
import { describe, expect, it } from "vitest";
import { handleBlockchainIQRequest } from "../src/routes.js";
import { createServiceClient } from "../src/service.js";

describe.skipIf(process.env.LIVE_402 !== "1")("live 402 via Cloudflare agent routes (unpaid)", () => {
  const client = createServiceClient({});
  it("brief quotes 10000 atomic USDC on Base", async () => {
    const res = await handleBlockchainIQRequest(new Request("https://a.local/x/quote/brief"), client);
    expect(await res.json()).toMatchObject({ x402Version: 2, network: "eip155:8453", amount: "10000" });
  });
  it("event-risk quotes 50000 atomic USDC on Base", async () => {
    const res = await handleBlockchainIQRequest(new Request("https://a.local/x/quote/event-risk?days=7"), client);
    expect(await res.json()).toMatchObject({ x402Version: 2, network: "eip155:8453", amount: "50000" });
  });
});
