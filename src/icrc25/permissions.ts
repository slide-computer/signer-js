import type { JsonObject } from "@icp-sdk/core/candid";
import type { JsonRequest, JsonResponse } from "../transport.js";

export type PermissionScope = { method: string } & JsonObject;

export type PermissionState = "denied" | "ask_on_use" | "granted";

export type PermissionsRequest = JsonRequest<"icrc25_permissions">;

export type PermissionsResponse = JsonResponse<{
  scopes: Array<{ scope: PermissionScope; state: PermissionState }>;
}>;
