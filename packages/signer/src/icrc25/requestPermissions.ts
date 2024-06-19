import type { JsonRequest } from "../transport";
import type { PermissionScope, PermissionsResponse } from "./permissions";

export type RequestPermissionsRequest = JsonRequest<
  "icrc25_request_permissions",
  {
    scopes: PermissionScope[];
  }
>;

export type RequestPermissionsResponse = PermissionsResponse;
