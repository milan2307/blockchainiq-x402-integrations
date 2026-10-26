import { describe, expect, it } from "vitest";
import { ViemWalletProvider } from "@coinbase/agentkit";
import { createWalletClient, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { blockchainIQActionProvider } from "../src/agentkit/index.js";
import { createFakeServer, FAKE_TX } from "./fake-x402-server.js";

function walletOn(chain: typeof base | typeof baseSepolia) {
  const account = privateKeyToAccount(generatePrivateKey());
  return new ViemWalletProvider(createWalletClient({ account, chain, transport: http() }));
}

describe("AgentKit action provider", () => {
  it("supports Base mainnet only", () => {
    const provider = blockchainIQActionProvider();
    expect(provider.supportsNetwork(walletOn(base).getNetwork())).toBe(true);
    expect(provider.supportsNetwork(walletOn(baseSepolia).getNetwork())).toBe(false);
  });

  it("registers get_market_brief and get_event_risk actions", () => {
    const actions = blockchainIQActionProvider().getActions(walletOn(base));
    expect(actions.map((a) => a.name)).toEqual(["BlockchainIQActionProvider_get_market_brief", "BlockchainIQActionProvider_get_event_risk"]);
  });

  it("get_market_brief pays with the agent's wallet and returns the tx hash", async () => {
    const server = createFakeServer({ amount: "10000" });
    const wallet = walletOn(base);
    const actions = blockchainIQActionProvider({ fetchImpl: server.fetch }).getActions(wallet);
    const brief = actions.find((a) => a.name.endsWith("get_market_brief"))!;
    const out = JSON.parse(await brief.invoke({}));
    expect(out.settlement.transaction).toBe(FAKE_TX);
    expect(server.verifiedPayers).toEqual([wallet.getAddress()]);
  });

  it("returns an error string (not a throw) when the price exceeds the cap", async () => {
    const server = createFakeServer({ amount: "500000" });
    const actions = blockchainIQActionProvider({ fetchImpl: server.fetch }).getActions(walletOn(base));
    const out = JSON.parse(await actions[0].invoke({}));
    expect(out.error).toBeDefined();
    expect(server.requests.some((r) => r.paid)).toBe(false);
  });
});
