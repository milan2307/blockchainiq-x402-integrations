/**
 * Worker-side wiring for the shared core: builds a capped, Base-only, payee-pinned
 * paying client from the Worker's env. Pure (no Cloudflare imports), so it is
 * tested in Node with the same fake x402 server as the other adapters.
 */
import {
  BLOCKCHAIN_IQ_BASE_URL,
  BLOCKCHAIN_IQ_PAY_TO,
  BlockchainIQClient,
  createPayingFetchFromPrivateKey,
} from "../../src/core/index.js";

export interface BlockchainIQEnv {
  /** Worker secret (wrangler secret put / .dev.vars). Never logged, never returned. */
  AGENT_PRIVATE_KEY?: string;
  /** Per-call cap in USD, default "0.06" (covers event-risk at $0.05). */
  MAX_USD_PER_CALL?: string;
  /** Override only for local tests against a fake server; payee stays pinned. */
  BIQ_BASE_URL?: string;
}

export interface ServiceOverrides {
  fetchImpl?: typeof fetch;
}

export function createServiceClient(env: BlockchainIQEnv, { fetchImpl = fetch }: ServiceOverrides = {}): BlockchainIQClient {
  const maxUsdPerCall = env.MAX_USD_PER_CALL ? Number(env.MAX_USD_PER_CALL) : 0.06;
  if (!Number.isFinite(maxUsdPerCall) || maxUsdPerCall <= 0 || maxUsdPerCall > 0.5) {
    throw new Error("MAX_USD_PER_CALL must be a number above 0 and at most 0.5");
  }
  const baseUrl = env.BIQ_BASE_URL || BLOCKCHAIN_IQ_BASE_URL;
  // Unpaid reads (quotes) need no key; paid reads fail clearly if the secret is missing.
  const payingFetch: typeof fetch = env.AGENT_PRIVATE_KEY
    ? createPayingFetchFromPrivateKey(env.AGENT_PRIVATE_KEY, { maxUsdPerCall, fetchImpl, expectedPayTo: BLOCKCHAIN_IQ_PAY_TO })
    : () => Promise.reject(new Error("AGENT_PRIVATE_KEY is not set (wrangler secret put AGENT_PRIVATE_KEY, or .dev.vars locally)"));
  return new BlockchainIQClient({ payingFetch, plainFetch: fetchImpl, baseUrl });
}
