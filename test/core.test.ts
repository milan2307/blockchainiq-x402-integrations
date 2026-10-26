import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { BlockchainIQClient, buildResourceUrl, createPayingFetch } from "../src/core/index.js";
import { createFakeServer, FAKE_TX, LIVE_PAY_TO } from "./fake-x402-server.js";

const throwaway = () => privateKeyToAccount(generatePrivateKey());

describe("buildResourceUrl", () => {
  it("builds the brief and event-risk URLs from the catalogue paths", () => {
    expect(buildResourceUrl("brief")).toBe("https://www.blockchainiq.co/api/x402/v1/brief");
    expect(buildResourceUrl("eventRisk", { days: 14, minImportance: 2 })).toBe(
      "https://www.blockchainiq.co/api/x402/v1/event-risk?days=14&minImportance=2",
    );
  });
  it("rejects out-of-range parameters before any request", () => {
    expect(() => buildResourceUrl("eventRisk", { days: 0 })).toThrow(RangeError);
    expect(() => buildResourceUrl("eventRisk", { days: 91 })).toThrow(RangeError);
    expect(() => buildResourceUrl("eventRisk", { minImportance: 4 as never })).toThrow(RangeError);
  });
});

describe("BlockchainIQClient with a paying fetch", () => {
  it("pays the 402 with a valid signed USDC authorization and returns the settlement proof", async () => {
    const server = createFakeServer({ amount: "10000" });
    const account = throwaway();
    const client = new BlockchainIQClient({
      payingFetch: createPayingFetch(account, { fetchImpl: server.fetch }),
      plainFetch: server.fetch,
    });
    const result = await client.getBrief();
    expect(server.requests.map((r) => r.paid)).toEqual([false, true]);
    expect(server.verifiedPayers).toEqual([account.address]);
    expect(result.settlement).toMatchObject({ success: true, transaction: FAKE_TX, network: "eip155:8453" });
    expect(result.disclaimer).toContain("not investment advice");
  });

  it("passes event-risk parameters through and pays $0.05", async () => {
    const server = createFakeServer({ amount: "50000" });
    const client = new BlockchainIQClient({
      payingFetch: createPayingFetch(throwaway(), { fetchImpl: server.fetch }),
    });
    const result = await client.getEventRisk({ days: 7, minImportance: 2 });
    expect(result.url).toContain("event-risk?days=7&minImportance=2");
    expect(result.settlement?.transaction).toBe(FAKE_TX);
  });

  it("refuses a payment above the spend cap and never sends a signature", async () => {
    const server = createFakeServer({ amount: "500000" }); // $0.50
    const client = new BlockchainIQClient({
      payingFetch: createPayingFetch(throwaway(), { maxUsdPerCall: 0.06, fetchImpl: server.fetch }),
    });
    await expect(client.getBrief()).rejects.toThrow();
    expect(server.requests.some((r) => r.paid)).toBe(false);
  });

  it("refuses to pay on any network other than Base mainnet", async () => {
    const server = createFakeServer({ network: "eip155:84532" });
    const client = new BlockchainIQClient({
      payingFetch: createPayingFetch(throwaway(), { fetchImpl: server.fetch }),
    });
    await expect(client.getBrief()).rejects.toThrow();
    expect(server.requests.some((r) => r.paid)).toBe(false);
  });

  it("quotes a price from the 402 challenge without paying", async () => {
    const server = createFakeServer({ amount: "10000" });
    const client = new BlockchainIQClient({ payingFetch: server.fetch, plainFetch: server.fetch });
    const quote = await client.quote("brief");
    expect(quote).toMatchObject({ x402Version: 2, network: "eip155:8453", usd: 0.01, payTo: LIVE_PAY_TO });
    expect(server.requests).toHaveLength(1);
  });
});

describe("payee pinning", () => {
  it("refuses to pay an address other than the pinned one", async () => {
    const server = createFakeServer({ amount: "10000" });
    const client = new BlockchainIQClient({
      payingFetch: createPayingFetch(throwaway(), { fetchImpl: server.fetch, expectedPayTo: "0x000000000000000000000000000000000000dEaD" }),
    });
    await expect(client.getBrief()).rejects.toThrow();
    expect(server.requests.some((r) => r.paid)).toBe(false);
  });
  it("pays when the challenge payee matches the pin (case-insensitive)", async () => {
    const server = createFakeServer({ amount: "10000" });
    const client = new BlockchainIQClient({
      payingFetch: createPayingFetch(throwaway(), { fetchImpl: server.fetch, expectedPayTo: LIVE_PAY_TO.toLowerCase() }),
    });
    expect((await client.getBrief()).settlement?.transaction).toBe(FAKE_TX);
  });
});
