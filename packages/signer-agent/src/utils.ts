import {
  type CallRequest,
  Cbor,
  Expiry,
  type ReadStateOptions,
  type RequestId,
  type SubmitRequestType,
} from "@dfinity/agent";
import { Principal } from "@dfinity/principal";
import { BigNumber } from "bignumber.js";

type DecodedCallRequest = Record<string, any> & {
  request_type: SubmitRequestType.Call;
  canister_id: Uint8Array;
  method_name: string;
  arg: Uint8Array;
  sender: Uint8Array;
  ingress_expiry: BigNumber;
};

export const decodeCallRequest = (contentMap: ArrayBuffer): CallRequest => {
  const decoded = Cbor.decode<DecodedCallRequest>(contentMap);
  const expiry = new Expiry(0);
  // @ts-ignore Expiry class currently has no method to create instance from value
  expiry._value = BigInt(decoded.ingress_expiry.toString(10));
  return {
    ...decoded,
    canister_id: Principal.from(decoded.canister_id),
    ingress_expiry: expiry,
  };
};

export const requestIdFromReadStateOptions = (
  options: ReadStateOptions,
): RequestId => {
  if (options.paths.length === 1 && options.paths[0].length == 2) {
    const path = new TextDecoder().decode(options.paths[0][0]);
    if (path === "request_status") {
      return options.paths[0][1] as RequestId;
    }
  }
  throw Error("Request id could not be found in options");
};

export const requestIdToReadStateOptions = (
  requestId: RequestId,
): ReadStateOptions => ({
  paths: [[new TextEncoder().encode("request_status"), requestId]],
});
