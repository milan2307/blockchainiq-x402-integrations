/**
 * Workaround for @coinbase/agentkit 0.10.x: every WalletProvider fires an
 * un-awaited analytics POST on construction, and a non-2xx reply becomes an
 * unhandled promise rejection that crashes Node (observed 2026-10-26: HTTP 400).
 * This handler swallows only rejections thrown from AgentKit's
 * sendAnalyticsEvent and rethrows everything else, so real errors still crash.
 */
let installed = false;

export function ignoreAgentKitAnalyticsFailures(): void {
  if (installed) return;
  installed = true;
  process.on("unhandledRejection", (reason) => {
    const stack = reason instanceof Error ? (reason.stack ?? "") : "";
    if (stack.includes("sendAnalyticsEvent")) {
      console.warn("[blockchainiq] AgentKit analytics request failed; ignored:", (reason as Error).message);
      return;
    }
    throw reason;
  });
}
