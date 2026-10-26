# Blockchain IQ x402 integrations: LangChain tool, Coinbase AgentKit action provider, Cloudflare Agents agent

Pay-per-call access to [Blockchain IQ](https://www.blockchainiq.co/agents)'s crypto **data and research** API from three agent frameworks. No account and no API key: an unpaid request gets HTTP 402, the integration pays in USDC on Base with [x402](https://www.x402.org) v2, and the JSON comes back with a settlement receipt.

| Framework | What it is | File |
| --- | --- | --- |
| LangChain (JS) | Two structured tools: `blockchainiq_market_brief`, `blockchainiq_event_risk` | [`src/langchain/tools.ts`](src/langchain/tools.ts) |
| Coinbase AgentKit | Action provider `BlockchainIQActionProvider` with `get_market_brief`, `get_event_risk` | [`src/agentkit/provider.ts`](src/agentkit/provider.ts) |
| Cloudflare Agents | `BlockchainIqAgent` (Agents SDK, Durable Object): `@callable` `getMarketBrief` / `getEventRisk`, HTTP routes, and AI SDK tools for `AIChatAgent` | [`cloudflare-agents/src/agent.ts`](cloudflare-agents/src/agent.ts) |

Resources wrapped (prices from the [free catalogue](https://www.blockchainiq.co/api/x402/v1), read 2026-10-26, and confirmed by the live 402 challenges):

| Resource | Price | What it returns |
| --- | --- | --- |
| `GET /api/x402/v1/brief` | $0.01 (10000 atomic USDC) | BTC, ETH, SOL, XRP price and 24h/7d/30d moves, events in the next 48 h, short risk flags |
| `GET /api/x402/v1/event-risk?days=&minImportance=` | $0.05 (50000 atomic USDC) | Scheduled US data releases, central-bank decisions, Treasury auctions, dated crypto/regulatory milestones, each with its official source |

This is a data tool for research agents. It returns market data, not advice, and it places no trades.

## Quick start

```bash
npm install
npm test                 # 14 offline tests, no wallet, no network
npm run test:live-402    # unpaid GETs to the live API: reads the 402 price only
```

### One real paid call each ($0.01 to `brief`)

Use a **dedicated** wallet holding a few cents of USDC on Base (settlement is gasless for the payer).

```bash
export AGENT_PRIVATE_KEY=0x...      # throwaway wallet, never a main wallet
npm run paid:langchain              # LangChain tool -> brief, prints the tx hash
npm run paid:agentkit               # AgentKit action -> brief, prints the tx hash
npm run paid:cloudflare             # Cloudflare agent in local workerd (wrangler dev) -> brief
```

Each script checks the USDC balance first (read-only), caps the payment at $0.01, then prints the `PAYMENT-RESPONSE` proof and a Basescan link. Set `PROOF_FILE=proofs.jsonl` to save the proofs, then `npm run record-proofs` writes them into the table below.

## Use in LangChain

```ts
import { privateKeyToAccount } from "viem/accounts";
import { BlockchainIQClient, createPayingFetch, createBlockchainIQTools, createBlockchainIQBriefTool } from "./src/index.js";

const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`);
const client = new BlockchainIQClient({ payingFetch: createPayingFetch(account, { maxUsdPerCall: 0.06 }) });
const tools = createBlockchainIQTools(client);   // pass to createAgent / model.bindTools(tools)

const brief = JSON.parse(await createBlockchainIQBriefTool(client).invoke({}));
console.log(brief.data, brief.settlement.transaction);
```

## Use in Coinbase AgentKit

```ts
import { AgentKit, ViemWalletProvider } from "@coinbase/agentkit";
import { blockchainIQActionProvider } from "./src/index.js";

const agentKit = await AgentKit.from({
  walletProvider,                                   // any EvmWalletProvider on Base mainnet
  actionProviders: [blockchainIQActionProvider({ maxUsdPerCall: 0.06 })],
});
// agentKit.getActions() now includes BlockchainIQActionProvider_get_market_brief and _get_event_risk.
// With @coinbase/agentkit-langchain, getLangChainTools(agentKit) exposes them to a LangChain agent too.
```

AgentKit's `@CreateAction` decorator needs `experimentalDecorators` and `emitDecoratorMetadata`, so the package is compiled with `tsc` (esbuild-based runners such as `tsx` drop decorator metadata). Payments are signed by the agent's own wallet provider (`walletProvider.toSigner()`), the same path AgentKit's built-in x402 provider uses. The provider reports `supportsNetwork` only for Base mainnet. AgentKit itself POSTs usage analytics to Coinbase whenever a wallet provider is created. In 0.10.4 that request is not awaited, so a failed reply (we saw HTTP 400 on 2026-10-26) becomes an unhandled rejection that kills Node. Call `ignoreAgentKitAnalyticsFailures()` first (the example does); it swallows only rejections from AgentKit's `sendAnalyticsEvent` and rethrows anything else.

## Use in Cloudflare Agents

The agent lives in [`cloudflare-agents/`](cloudflare-agents/) (its own package, because the Agents SDK needs zod 4 while AgentKit pins zod 3). It imports the same core from `../src/core`.

```bash
npm ci && (cd cloudflare-agents && npm ci)
cd cloudflare-agents
cp .dev.vars.example .dev.vars            # put a throwaway AGENT_PRIVATE_KEY in it; never commit it
npx wrangler dev --local                  # free, runs workerd locally, no Cloudflare account
curl http://127.0.0.1:8787/agents/blockchain-iq-agent/default/quote/brief   # free: reads the 402 price
curl http://127.0.0.1:8787/agents/blockchain-iq-agent/default/brief         # paid $0.01
curl "http://127.0.0.1:8787/agents/blockchain-iq-agent/default/event-risk?days=7&minImportance=2"   # paid $0.05
```

From a client, call the `@callable` methods over the Agents RPC:

```ts
import { AgentClient } from "agents/client";
const agent = new AgentClient({ agent: "blockchain-iq-agent", name: "default", host: "127.0.0.1:8787", protocol: "ws" });
const brief = JSON.parse(await agent.call("getMarketBrief"));      // { data, disclaimer, settlement: { transaction, ... } }
```

Inside your own `AIChatAgent`, give the model the tools: `tools: createBlockchainIQAiTools(createServiceClient(this.env))`.

The agent reads the key only from the `AGENT_PRIVATE_KEY` secret (`.dev.vars` locally, `wrangler secret put` when deployed), caps each payment with `MAX_USD_PER_CALL` (default 0.06, hard ceiling 0.5), pays only on Base mainnet, and pays only Blockchain IQ's payee `0x617dA9383fbA67e86137BC4924b8b7E400fB7C9e`. Deploying is optional; everything above runs locally.

## Safety

- **Spend cap:** every paying fetch refuses any single payment above `maxUsdPerCall` (default $0.06, enough for `event-risk`). The examples use $0.01.
- **Base mainnet only:** a policy drops payment options on any other network.
- **Keys:** read from `AGENT_PRIVATE_KEY` only, never logged, never written. `.gitignore` blocks `.env` and `*.key`.
- **No silent failures:** errors from Blockchain IQ (404, 5xx) are never charged and surface as errors; the AgentKit actions return them as a JSON `error` string so the agent can react.

## Layout

```
src/core/       resources.ts (URLs, params) · payment.ts (x402 paying fetch, caps) · client.ts (BlockchainIQClient, quote, receipts) · format.ts
src/langchain/  tools.ts      thin LangChain adapter over the core client
src/agentkit/   provider.ts   thin AgentKit adapter over the core client
cloudflare-agents/src/  agent.ts (Agents SDK agent) · routes.ts (HTTP) · service.ts (env -> capped client) · tools.ts (AI SDK tools)
examples/       one paid call per framework
test/           offline tests with an in-process x402 server that verifies the EIP-3009 signature; opt-in live 402 test
```

## Tests and what they prove

`npm test` runs against an in-process fake of Blockchain IQ's x402 v2 server (`test/fake-x402-server.ts`). It returns a 402 shaped like the live one and, on the retry, **verifies the signed USDC `TransferWithAuthorization` with viem** (signer, payee, amount) before answering 200 with a `PAYMENT-RESPONSE` receipt. Nothing is broadcast. Covered: URL and parameter validation, a paid `brief` and `event-risk`, the spend cap (a $0.50 challenge is refused and no signature is sent), non-Base networks refused, price quotes, both LangChain tools, the AgentKit network check, action registration, a paid AgentKit action, and the error path.

Cloudflare Agents (`npm run test:cloudflare`): 9 offline route/tool tests in Node, plus an opt-in run of the real Worker and Durable Object in workerd (`wrangler dev --local`) pointed at the fake x402 server: a paid `/brief` over HTTP, a paid `getMarketBrief` over the Agents WebSocket RPC, and the env cap refusing a $0.05 call. `cd cloudflare-agents && npm run test:live-402` reads the live 402 prices through the agent's routes.

`npm run test:live-402` makes plain unpaid GETs to the live API and checks the 402: x402 v2, `eip155:8453`, 10000 for `brief`, 50000 for `event-risk`.

## Paid-call proofs (Base mainnet)

<!-- PAID-CALL-PROOFS:START -->
_No paid call recorded yet. Run the three `paid:*` scripts with a funded wallet and `PROOF_FILE=proofs.jsonl`, then `npm run record-proofs`._
<!-- PAID-CALL-PROOFS:END -->

## Licence

MIT, Copyright (c) 2026 LamuLabs. Not affiliated with Blockchain IQ or Coinbase. Blockchain IQ's data is market data and analysis, not investment advice; see their [terms](https://www.blockchainiq.co/terms).
