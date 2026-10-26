import type { PaidResult } from "./client.js";

/** Serialises a paid result for an LLM tool: data, disclaimer and settlement proof. */
export function formatToolResult(result: PaidResult): string {
  return JSON.stringify({
    data: result.data,
    disclaimer: result.disclaimer,
    settlement: result.settlement ?? null,
  });
}
