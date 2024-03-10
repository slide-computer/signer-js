import type { PermissionScope } from "../icrc25";
import type { JsonRequest, JsonResponse } from "../transport";

export type GetPrincipalsPermissionScope =
  PermissionScope<"icrc31_get_principals">;

export const createGetPrincipalsPermissionScope =
  (): GetPrincipalsPermissionScope => ({
    method: "icrc31_get_principals",
  });

export type GetPrincipalsRequest = JsonRequest<"icrc31_get_principals">;

export type GetPrincipalsResponse = JsonResponse<{
  principals: string[];
}>;
