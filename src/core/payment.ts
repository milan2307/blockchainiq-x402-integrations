import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import type { ClientEvmSigner } from "@x402/evm";

/** Base mainnet, the only network Blockchain IQ settles on. */
export const BASE_MAINNET = "eip155:8453";

/** Default per-call cap in USD: covers event-risk ($0.05), refuses anything dearer. */
export const DEFAULT_MAX_USD_PER_CALL = 0.06;

export interface PayingFetchOptions {
  /** Refuse any single payment above this many US dollars. */
  maxUsdPerCall?: number;
  /** Underlying fetch (injectable for tests). */
  fetchImpl?: typeof fetch;
}

/**
 * Wraps fetch so that an HTTP 402 from Blockchain IQ is paid in USDC on Base
 * and retried. The signer never leaves the process; settlement is gasless
 * for the payer. Only Base mainnet requirements are ever accepted.
 */
export function createPayingFetch(
  signer: ClientEvmSigner,
  { maxUsdPerCall = DEFAULT_MAX_USD_PER_CALL, fetchImpl = fetch }: PayingFetchOptions = {},
): typeof fetch {
  const client = x402Client.fromConfig({
    schemes: [{ network: BASE_MAINNET, client: new ExactEvmScheme(signer) }],
    spendControls: { maxAmountPerPayment: maxUsdPerCall },
  });
  client.registerPolicy((_version, requirements) =>
    requirements.filter((r) => r.network === BASE_MAINNET),
  );
  return wrapFetchWithPayment(fetchImpl, client) as typeof fetch;
}
