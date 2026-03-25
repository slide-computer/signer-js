import type { JsonRequest, JsonResponse } from "../transport.js";

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
