import type { PermissionScope } from "../icrc25";
import type { JsonRequest, JsonResponse } from "../transport";
import type { SignedDelegation } from "../icrc32";
import { Principal } from "@dfinity/principal";

export type GetGlobalDelegationPermissionScope =
  PermissionScope<"icrc34_get_global_delegation"> & { targets: string[] };

export const createGetGlobalDelegationPermissionScope = (params: {
  targets: Principal[];
}): GetGlobalDelegationPermissionScope => ({
  method: "icrc34_get_global_delegation",
  targets: params.targets.map((p) => p.toText()),
});

export type GetGlobalDelegationRequest = JsonRequest<
  "icrc34_get_global_delegation",
  {
    publicKey: string;
    principal: string;
    targets: string[];
    maxTimeToLive?: string;
  }
>;

export type GetGlobalDelegationResponse = JsonResponse<{
  publicKey: string;
  global_delegation: SignedDelegation[];
}>;
