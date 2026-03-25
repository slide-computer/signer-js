import type { PermissionScope } from "../icrc25/index.js";
import type { JsonRequest, JsonResponse } from "../transport.js";

export type AccountsPermissionScope = PermissionScope<"icrc27_accounts">;

export const createAccountsPermissionScope = (): AccountsPermissionScope => ({
  method: "icrc27_accounts",
});

export type AccountsRequest = JsonRequest<"icrc27_accounts">;

export type AccountsResponse = JsonResponse<{
  accounts: Array<{
    owner: string;
    subaccount?: string;
  }>;
}>;
