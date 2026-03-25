import type { JsonRequest, JsonResponse } from "../transport.js";

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
