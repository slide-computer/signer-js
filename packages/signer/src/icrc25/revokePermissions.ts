import type { JsonRequest, JsonResponse } from "../transport";
import type { PermissionScope } from "./requestPermissions";

export type RevokePermissionsRequest = JsonRequest<
  "icrc25_revoke_permissions",
  {
    scopes: PermissionScope[];
  }
>;

export type RevokePermissionsResponse = JsonResponse<{
  scopes: PermissionScope[];
}>;
