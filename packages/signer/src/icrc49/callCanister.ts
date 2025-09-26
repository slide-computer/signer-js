import type { JsonRequest, JsonResponse } from "../transport.js";
import type { PermissionScope } from "../icrc25/index.js";

export type CallCanisterPermissionScope =
  PermissionScope<"icrc49_call_canister">;

export const createCallCanisterPermissionScope =
  (): CallCanisterPermissionScope => ({ method: "icrc49_call_canister" });

export type CallCanisterRequest = JsonRequest<
  "icrc49_call_canister",
  {
    canisterId: string;
    sender: string;
    method: string;
    arg: string;
    nonce?: string;
  }
>;

export type CallCanisterResponse = JsonResponse<{
  contentMap: string;
  certificate: string;
}>;
