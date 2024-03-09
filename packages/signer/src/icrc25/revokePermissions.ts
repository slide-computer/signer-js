import { JsonRequest, JsonResponse } from "../transport";
import { PermissionScope } from "./requestPermissions";

export type RevokePermissionsRequest = JsonRequest<
  "icrc25_revoke_permissions",
  {
    scopes: PermissionScope[];
  }
>;

export type RevokePermissionsResponse = JsonResponse<{
  scopes: PermissionScope[];
}>;
