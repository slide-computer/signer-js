import { type CallRequest, Expiry } from "@dfinity/agent";
import { decode } from "./cbor";
import { Principal } from "@dfinity/principal";
import { SubmitRequestType } from "@dfinity/agent/lib/esm/agent/http/types";

type DecodedCallRequest = Record<string, any> & {
  request_type: SubmitRequestType.Call;
  canister_id: Uint8Array;
  method_name: string;
  arg: Uint8Array;
  sender: Uint8Array;
  ingress_expiry: bigint;
};

export const decodeCallRequest = (contentMap: ArrayBuffer): CallRequest => {
  const decoded = decode<DecodedCallRequest>(contentMap);
  const expiry = new Expiry(0);
  // @ts-ignore Expiry class currently has no method to create instance from value
  expiry._value = decoded.ingress_expiry;
  return {
    ...decoded,
    canister_id: Principal.from(decoded.canister_id),
    ingress_expiry: expiry,
  };
};
