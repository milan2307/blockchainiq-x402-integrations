/**
 * In-process stand-in for Blockchain IQ's x402 v2 endpoints. It issues a 402
 * challenge shaped like the live one, and on retry it checks the signed
 * EIP-3009 authorization cryptographically. Nothing is broadcast; no funds move.
 */
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import { verifyTypedData, type Address, type Hex } from "viem";

export const LIVE_PAY_TO = "0x617dA9383fBA67e86137BC4924b8b7E400fB7C9e";
export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const FAKE_TX = ("0x" + "ab".repeat(32)) as Hex;

export interface FakeServerOptions {
  amount?: string; // atomic USDC
  network?: string;
}

export interface FakeServer {
  fetch: typeof fetch;
  requests: { url: string; paid: boolean }[];
  verifiedPayers: string[];
}

export function createFakeServer({ amount = "10000", network = "eip155:8453" }: FakeServerOptions = {}): FakeServer {
  const requests: FakeServer["requests"] = [];
  const verifiedPayers: string[] = [];

  const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init);
    const signature = request.headers.get("payment-signature");
    requests.push({ url: request.url, paid: Boolean(signature) });

    const accepts = [
      {
        scheme: "exact",
        network,
        amount,
        asset: BASE_USDC,
        payTo: LIVE_PAY_TO,
        maxTimeoutSeconds: 300,
        extra: { name: "USD Coin", version: "2" },
      },
    ];
    const resource = { url: request.url, description: "fake", mimeType: "application/json" };

    if (!signature) {
      const header = encodePaymentRequiredHeader({ x402Version: 2, error: "Payment required", resource, accepts } as never);
      return new Response(JSON.stringify({ error: "Payment required" }), {
        status: 402,
        headers: { "content-type": "application/json", "payment-required": header },
      });
    }

    const payload = decodePaymentSignatureHeader(signature) as unknown as {
      payload: { signature: Hex; authorization: Record<string, string> };
    };
    const auth = payload.payload.authorization;
    const valid = await verifyTypedData({
      address: auth.from as Address,
      domain: { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: BASE_USDC },
      types: {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
      primaryType: "TransferWithAuthorization",
      message: {
        from: auth.from as Address,
        to: auth.to as Address,
        value: BigInt(auth.value),
        validAfter: BigInt(auth.validAfter),
        validBefore: BigInt(auth.validBefore),
        nonce: auth.nonce as Hex,
      },
      signature: payload.payload.signature,
    });
    if (!valid || auth.to.toLowerCase() !== LIVE_PAY_TO.toLowerCase() || auth.value !== amount) {
      return new Response(JSON.stringify({ error: "bad payment" }), { status: 402 });
    }
    verifiedPayers.push(auth.from);

    const receipt = encodePaymentResponseHeader({ success: true, transaction: FAKE_TX, network, payer: auth.from } as never);
    const body = {
      source: "Blockchain IQ",
      disclaimer: "Market data and analysis, not investment advice.",
      data: { asOf: "2026-10-26T05:00:00.000Z", url: request.url },
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json", "payment-response": receipt },
    });
  };

  return { fetch: fakeFetch as typeof fetch, requests, verifiedPayers };
}
