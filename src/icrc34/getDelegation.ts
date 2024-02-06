import { PermissionScope } from "../icrc25";
import { JsonRequest, JsonResponse } from "../transport";
import { SignedDelegation } from "../icrc32";

export type GetDelegationPermissionScope =
  PermissionScope<"icrc34_get_delegation">;
export const GET_DELEGATION_PERMISSION_SCOPE: GetDelegationPermissionScope = {
  method: "icrc34_get_delegation",
};

export type GetDelegationRequest = JsonRequest<
  "icrc34_get_delegation",
  {
    publicKey: string;
    principal: string;
    targets?: string[];
  }
>;

export type GetDelegationResponse = JsonResponse<{
  publicKey: string;
  delegations: SignedDelegation[];
}>;
