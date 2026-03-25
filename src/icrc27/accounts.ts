import type { JsonRequest, JsonResponse } from "../transport.js";

export type AccountsRequest = JsonRequest<"icrc27_accounts">;

export type AccountsResponse = JsonResponse<{
  accounts: Array<{
    owner: string;
    subaccount?: string;
  }>;
}>;
