import type { JsonRequest, JsonResponse } from "../transport.js";

export type Delegation = {
  pubkey: string;
  expiration: string;
  targets?: string[];
};

export type SignerDelegation = {
  delegation: Delegation;
  signature: string;
};

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
