import { PermissionScope } from "../icrc25";
import { JsonRequest, JsonResponse } from "../transport";
import { SignedDelegation } from "../icrc32";
import { Principal } from "@dfinity/principal";

export type GetSessionDelegationPermissionScope =
  PermissionScope<"icrc57_get_session_delegation"> & { targets?: string[] };

export const createGetSessionDelegationPermissionScope = (params?: {
  targets?: Principal[];
}): GetSessionDelegationPermissionScope => ({
  method: "icrc57_get_session_delegation",
  targets: params?.targets?.map((p) => p.toText()),
});

export type GetSessionDelegationRequest = JsonRequest<
  "icrc57_get_session_delegation",
  {
    publicKey: string;
    targets?: string[];
    maxTimeToLive?: string;
  }
>;

export type GetSessionDelegationResponse = JsonResponse<{
  publicKey: string;
  session_delegation: SignedDelegation[];
}>;
