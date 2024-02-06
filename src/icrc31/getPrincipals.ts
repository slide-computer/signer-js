import { PermissionScope } from "../icrc25";
import { JsonRequest, JsonResponse } from "../transport";

export type GetPrincipalsPermissionScope =
  PermissionScope<"icrc31_get_principals">;

export const GET_PRINCIPALS_PERMISSION_SCOPE: GetPrincipalsPermissionScope = {
  method: "icrc31_get_principals",
};

export type GetPrincipalsRequest = JsonRequest<"icrc31_get_principals">;

export type GetPrincipalsResponse = JsonResponse<{
  principals: string[];
}>;
