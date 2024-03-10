import type { JsonRequest, JsonResponse } from "../transport";
import type { PermissionScope } from "./requestPermissions";

export type GrantedPermissionsRequest =
  JsonRequest<"icrc25_granted_permissions">;

export type GrantedPermissionsResponse = JsonResponse<{
  scopes: PermissionScope[];
}>;
