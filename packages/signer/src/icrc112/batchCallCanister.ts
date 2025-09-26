import type { JsonRequest, JsonResponse } from "../transport.js";
import type { PermissionScope } from "../icrc25/index.js";

export type BatchCallCanisterPermissionScope =
  PermissionScope<"icrc112_batch_call_canister">;

export const createBatchCallCanisterPermissionScope =
  (): BatchCallCanisterPermissionScope => ({
    method: "icrc112_batch_call_canister",
  });

export type BatchCallCanisterRequest = JsonRequest<
  "icrc112_batch_call_canister",
  {
    sender: string;
    validationCanisterId?: string;
    requests: {
      canisterId: string;
      method: string;
      arg: string;
      nonce?: string;
    }[][];
  }
>;

export type BatchCallCanisterResponse = JsonResponse<{
  responses: {
    contentMap: string;
    certificate: string;
  }[][];
}>;
