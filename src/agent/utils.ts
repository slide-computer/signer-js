import {
  type CallRequest,
  Cbor,
  Expiry,
  JSON_KEY_EXPIRY,
  type SubmitRequestType,
} from "@icp-sdk/core/agent";
import { Principal } from "@icp-sdk/core/principal";

type DecodedCallRequest = Record<string, any> & {
  request_type: SubmitRequestType.Call;
  canister_id: Uint8Array;
  method_name: string;
  arg: Uint8Array;
  sender: Uint8Array;
  ingress_expiry: BigInt;
};

export const decodeCallRequest = (contentMap: Uint8Array): CallRequest => {
  const decoded = Cbor.decode<DecodedCallRequest>(contentMap);
  const expiry = Expiry.fromDeltaInMilliseconds(0);
  const json = expiry.toJSON();
  json[JSON_KEY_EXPIRY] = decoded.ingress_expiry.toString(10);
  return {
    ...decoded,
    canister_id: Principal.from(decoded.canister_id),
    ingress_expiry: Expiry.fromJSON(JSON.stringify(json)),
  };
};
