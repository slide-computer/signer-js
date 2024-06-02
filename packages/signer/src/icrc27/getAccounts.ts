import type { PermissionScope } from "../icrc25";
import type { JsonRequest, JsonResponse } from "../transport";

export type GetAccountsPermissionScope = PermissionScope<"icrc27_get_accounts">;

export const createGetAccountsPermissionScope =
  (): GetAccountsPermissionScope => ({
    method: "icrc27_get_accounts",
  });

export type GetAccountsRequest = JsonRequest<"icrc27_get_accounts">;

export type GetAccountsResponse = JsonResponse<{
  accounts: Array<{
    owner: string;
    subaccount?: string;
  }>;
}>;
