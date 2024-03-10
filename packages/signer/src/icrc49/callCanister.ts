import type { JsonRequest, JsonResponse } from "../transport";
import type { PermissionScope } from "../icrc25";
import { Principal } from "@dfinity/principal";

export type CallCanisterPermissionScope =
  PermissionScope<"icrc49_call_canister"> & {
    targets?: string[];
    senders?: string[];
  };

export const createCallCanisterPermissionScope = (params: {
  targets?: Principal[];
  senders?: Principal[];
}): CallCanisterPermissionScope => ({
  method: "icrc49_call_canister",
  targets: params.targets?.map((p) => p.toText()),
  senders: params.senders?.map((p) => p.toText()),
});

export type CallCanisterRequest = JsonRequest<
  "icrc49_call_canister",
  {
    canisterId: string;
    sender: string;
    method: string;
    arg: string;
  }
>;

export type CallCanisterResponse = JsonResponse<{
  contentMap: string;
  certificate: string;
}>;
