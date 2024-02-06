import { JsonRequest, JsonResponse } from "../transport";

export type PermissionScope<Method extends string = string> = {
  method: Method;
};

export type RequestPermissionsRequest = JsonRequest<
  "icrc25_request_permissions",
  {
    scopes: PermissionScope[];
  }
>;

export type RequestPermissionsResponse = JsonResponse<{
  scopes: PermissionScope[];
}>;
