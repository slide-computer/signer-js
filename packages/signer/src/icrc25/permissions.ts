import type { JsonRequest, JsonResponse } from "../transport";

export type PermissionScope<Method extends string = string> = {
  method: Method;
};

export type PermissionState = "denied" | "ask_on_use" | "granted";

export type PermissionsRequest = JsonRequest<"icrc25_permissions">;

export type PermissionsResponse = JsonResponse<{
  scopes: Array<{ scope: PermissionScope; state: PermissionState }>;
}>;
