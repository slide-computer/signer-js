import {
  CallRequest,
  Expiry,
  QueryRequest,
  ReadStateRequest,
} from "@dfinity/agent";
import { Principal } from "@dfinity/principal";
import * as cbor from "@dfinity/agent/lib/cjs/cbor";

export const base64ToBase64url = (value: string) =>
  value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

export const base64urlToBase64 = (value: string) => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return base64 + "=".repeat(base64.length % 4);
};

export const decodeRequestBody = (bytes: ArrayBuffer) =>
  Object.fromEntries(
    Object.entries(cbor.decode(bytes) as object).map(([key, value]) => {
      switch (key) {
        case "canister_id":
        case "sender":
          return [key, Principal.fromUint8Array(value)];
        case "ingress_expiry":
          const expiry = new Expiry(0);
          // @ts-ignore There's no public way to directly create an Expiry from a BigInt
          expiry._value = BigInt(value.toString());
          return [key, BigInt(value.toString())];
        default:
          return [key, value];
      }
    }),
  ) as CallRequest | QueryRequest | ReadStateRequest;

export const encodeRequestBody = (
  requestBody: CallRequest | QueryRequest | ReadStateRequest,
) => cbor.encode(requestBody);
