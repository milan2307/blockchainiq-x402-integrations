/**
 * The two Blockchain IQ resources this package wraps, as listed in the free
 * catalogue at https://www.blockchainiq.co/api/x402/v1 (read 2026-10-26).
 * The catalogue is the source of truth for prices; the 402 challenge is what
 * is actually paid, and the spend cap below refuses anything dearer.
 */
export const BLOCKCHAIN_IQ_BASE_URL = "https://www.blockchainiq.co";

export const RESOURCES = {
  brief: {
    path: "/api/x402/v1/brief",
    listedPriceUsd: 0.01,
    title: "Market brief",
  },
  eventRisk: {
    path: "/api/x402/v1/event-risk",
    listedPriceUsd: 0.05,
    title: "Event risk",
  },
} as const;

export type ResourceId = keyof typeof RESOURCES;

export interface EventRiskQuery {
  /** Window length in days, 1-90 (API default 7). */
  days?: number;
  /** Lowest importance to include: 1, 2 or 3 (API default 1). */
  minImportance?: 1 | 2 | 3;
}

/** Builds the full URL for a resource, validating event-risk parameters. */
export function buildResourceUrl(
  id: ResourceId,
  query: EventRiskQuery = {},
  baseUrl: string = BLOCKCHAIN_IQ_BASE_URL,
): string {
  const url = new URL(RESOURCES[id].path, baseUrl);
  if (id === "eventRisk") {
    if (query.days !== undefined) {
      if (!Number.isInteger(query.days) || query.days < 1 || query.days > 90) {
        throw new RangeError("days must be an integer from 1 to 90");
      }
      url.searchParams.set("days", String(query.days));
    }
    if (query.minImportance !== undefined) {
      if (![1, 2, 3].includes(query.minImportance)) {
        throw new RangeError("minImportance must be 1, 2 or 3");
      }
      url.searchParams.set("minImportance", String(query.minImportance));
    }
  }
  return url.toString();
}
