import type { PermissionScope } from "../icrc25";
import type { JsonRequest, JsonResponse } from "../transport";
import { Principal } from "@dfinity/principal";

export type DelegationPermissionScope = PermissionScope<"icrc34_delegation"> & {
  targets?: string[];
};

export type Delegation = {
  pubkey: string;
  expiration: string;
  targets?: string[];
};

export type SignerDelegation = {
  delegation: Delegation;
  signature: string;
};

export const createDelegationPermissionScope = (params: {
  targets?: Principal[];
}): DelegationPermissionScope => ({
  method: "icrc34_delegation",
  targets: params.targets?.map((p) => p.toText()),
});

export type DelegationRequest = JsonRequest<
  "icrc34_delegation",
  {
    publicKey: string;
    targets?: string[];
    maxTimeToLive?: string;
  }
>;

export type DelegationResponse = JsonResponse<{
  publicKey: string;
  signerDelegation: SignerDelegation[];
}>;
