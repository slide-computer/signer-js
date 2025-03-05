import type { JsonError, JsonRequest, JsonResponse } from "../transport";
import type { PermissionScope } from "../icrc25";

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
    requests: {
      canisterId: string;
      method: string;
      arg: string;
      nonce?: string;
    }[][];
    validation?: {
      canisterId: string;
      method: string;
    };
  }
>;

export type BatchCallCanisterResponse = JsonResponse<{
  responses: (
    | {
        result: {
          contentMap: string;
          certificate: string;
        };
      }
    | {
        error: JsonError;
      }
  )[][];
}>;
