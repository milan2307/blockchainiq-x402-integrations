import { decodePaymentRequiredHeader, decodePaymentResponseHeader } from "@x402/core/http";
import { BLOCKCHAIN_IQ_BASE_URL, buildResourceUrl, type EventRiskQuery, type ResourceId } from "./resources.js";

/** Proof of settlement, read from the PAYMENT-RESPONSE header. */
export interface SettlementProof {
  success: boolean;
  transaction: string;
  network: string;
  payer?: string;
}

export interface PaidResult<T = unknown> {
  resource: ResourceId;
  url: string;
  /** The `data` field of Blockchain IQ's JSON envelope. */
  data: T;
  disclaimer?: string;
  /** Present when the call was paid; absent only if the server sent no receipt. */
  settlement?: SettlementProof;
}

/** Price quote read from an unpaid request's HTTP 402 challenge. */
export interface PriceQuote {
  url: string;
  x402Version: number;
  network: string;
  /** Atomic USDC units (6 decimals). */
  amount: string;
  usd: number;
  asset: string;
  payTo: string;
}

export class BlockchainIQError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "BlockchainIQError";
  }
}

export interface BlockchainIQClientOptions {
  /** A fetch that pays x402 challenges (see createPayingFetch). */
  payingFetch: typeof fetch;
  /** A plain fetch for free reads and quotes. Defaults to global fetch. */
  plainFetch?: typeof fetch;
  baseUrl?: string;
}

/**
 * Framework-neutral client. The LangChain tool and the AgentKit action
 * provider are thin adapters over this class.
 */
export class BlockchainIQClient {
  private readonly payingFetch: typeof fetch;
  private readonly plainFetch: typeof fetch;
  private readonly baseUrl: string;

  constructor({ payingFetch, plainFetch = fetch, baseUrl = BLOCKCHAIN_IQ_BASE_URL }: BlockchainIQClientOptions) {
    // Called through arrow wrappers: Workers' fetch throws "Illegal invocation" when invoked as a method of another object.
    this.payingFetch = (input, init) => payingFetch(input, init);
    this.plainFetch = (input, init) => plainFetch(input, init);
    this.baseUrl = baseUrl;
  }

  /** $0.01: BTC/ETH/SOL/XRP figures, events in the next 48 h, risk flags. */
  getBrief(): Promise<PaidResult> {
    return this.paidGet("brief");
  }

  /** $0.05: scheduled market-moving events, 7 days ahead by default. */
  getEventRisk(query: EventRiskQuery = {}): Promise<PaidResult> {
    return this.paidGet("eventRisk", query);
  }

  /** Free: reads the 402 challenge without paying. */
  async quote(resource: ResourceId, query: EventRiskQuery = {}): Promise<PriceQuote> {
    const url = buildResourceUrl(resource, query, this.baseUrl);
    const res = await this.plainFetch(url);
    if (res.status !== 402) {
      throw new BlockchainIQError(`expected HTTP 402 from ${url}, got ${res.status}`, res.status);
    }
    const header = res.headers.get("payment-required");
    if (!header) throw new BlockchainIQError("402 response had no PAYMENT-REQUIRED header", 402);
    const challenge = decodePaymentRequiredHeader(header);
    const accept = challenge.accepts[0];
    if (!accept) throw new BlockchainIQError("402 challenge listed no payment options", 402);
    return {
      url,
      x402Version: challenge.x402Version,
      network: accept.network,
      amount: accept.amount,
      usd: Number(accept.amount) / 1_000_000,
      asset: accept.asset,
      payTo: accept.payTo,
    };
  }

  private async paidGet(resource: ResourceId, query: EventRiskQuery = {}): Promise<PaidResult> {
    const url = buildResourceUrl(resource, query, this.baseUrl);
    const res = await this.payingFetch(url);
    if (!res.ok) {
      throw new BlockchainIQError(`Blockchain IQ ${resource} failed with HTTP ${res.status}`, res.status);
    }
    const body = (await res.json()) as { data: unknown; disclaimer?: string };
    const receipt = res.headers.get("payment-response");
    return {
      resource,
      url,
      data: body.data,
      disclaimer: body.disclaimer,
      settlement: receipt ? toProof(receipt) : undefined,
    };
  }
}

function toProof(header: string): SettlementProof {
  const decoded = decodePaymentResponseHeader(header) as SettlementProof;
  return {
    success: decoded.success,
    transaction: decoded.transaction,
    network: decoded.network,
    payer: decoded.payer,
  };
}
