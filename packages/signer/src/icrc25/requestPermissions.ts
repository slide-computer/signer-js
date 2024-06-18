import type { JsonRequest, JsonResponse } from "../transport";
import type { PermissionScope, PermissionState } from "./permissions";

export type RequestPermissionsRequest = JsonRequest<
  "icrc25_request_permissions",
  {
    scopes: PermissionScope[];
  }
>;

export type RequestPermissionsResponse = JsonResponse<{
  scopes: Array<{ scope: PermissionScope; state: PermissionState }>;
}>;
