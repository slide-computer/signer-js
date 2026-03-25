import type { JsonRequest } from "../transport.js";
import type { PermissionScope, PermissionsResponse } from "./permissions.js";

export type RequestPermissionsRequest = JsonRequest<
  "icrc25_request_permissions",
  {
    scopes: PermissionScope[];
  }
>;

export type RequestPermissionsResponse = PermissionsResponse;
