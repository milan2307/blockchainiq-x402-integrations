import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import type { ClientEvmSigner } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

/** Base mainnet, the only network Blockchain IQ settles on. */
export const BASE_MAINNET = "eip155:8453";

/** Blockchain IQ's payee, as served in its live 402 challenges (read 2026-10-26). */
export const BLOCKCHAIN_IQ_PAY_TO = "0x617dA9383fbA67e86137BC4924b8b7E400fB7C9e";

/** Default per-call cap in USD: covers event-risk ($0.05), refuses anything dearer. */
export const DEFAULT_MAX_USD_PER_CALL = 0.06;

export interface PayingFetchOptions {
  /** Refuse any single payment above this many US dollars. */
  maxUsdPerCall?: number;
  /** Underlying fetch (injectable for tests). */
  fetchImpl?: typeof fetch;
  /** If set, refuse to pay any address other than this one. */
  expectedPayTo?: string;
}

/**
 * Wraps fetch so that an HTTP 402 from Blockchain IQ is paid in USDC on Base
 * and retried. The signer never leaves the process; settlement is gasless
 * for the payer. Only Base mainnet requirements are ever accepted.
 */
export function createPayingFetch(
  signer: ClientEvmSigner,
  { maxUsdPerCall = DEFAULT_MAX_USD_PER_CALL, fetchImpl = fetch, expectedPayTo }: PayingFetchOptions = {},
): typeof fetch {
  const client = x402Client.fromConfig({
    schemes: [{ network: BASE_MAINNET, client: new ExactEvmScheme(signer) }],
    spendControls: { maxAmountPerPayment: maxUsdPerCall },
  });
  client.registerPolicy((_version, requirements) =>
    requirements.filter(
      (r) => r.network === BASE_MAINNET && (!expectedPayTo || r.payTo.toLowerCase() === expectedPayTo.toLowerCase()),
    ),
  );
  return wrapFetchWithPayment(fetchImpl, client) as typeof fetch;
}

/** Same as createPayingFetch, from a 0x-prefixed private key (e.g. a Worker secret). The key is never logged. */
export function createPayingFetchFromPrivateKey(privateKey: string, options: PayingFetchOptions = {}): typeof fetch {
  const key = privateKey.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("AGENT_PRIVATE_KEY must be a 0x-prefixed 32-byte hex key");
  return createPayingFetch(privateKeyToAccount(key as `0x${string}`), options);
}
