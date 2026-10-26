/**
 * Opt-in (LIVE_402=1): plain unpaid GETs to the live API. Reads the 402
 * challenge only. No wallet, no signature, nothing is paid.
 */
import { describe, expect, it } from "vitest";
import { BlockchainIQClient } from "../src/core/index.js";

const live = process.env.LIVE_402 === "1";

describe.skipIf(!live)("live Blockchain IQ 402 challenges (unpaid)", () => {
  const client = new BlockchainIQClient({ payingFetch: () => Promise.reject(new Error("no paying in this test")) });

  it("brief asks for 0.01 USDC on Base, x402 v2", async () => {
    const q = await client.quote("brief");
    console.log("brief quote", q);
    expect(q).toMatchObject({ x402Version: 2, network: "eip155:8453", amount: "10000" });
  });

  it("event-risk asks for 0.05 USDC on Base, x402 v2", async () => {
    const q = await client.quote("eventRisk", { days: 7 });
    console.log("event-risk quote", q);
    expect(q).toMatchObject({ x402Version: 2, network: "eip155:8453", amount: "50000" });
  });
});
