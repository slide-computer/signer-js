import { PermissionScope } from "../icrc25";
import { JsonRequest, JsonResponse } from "../transport";

export type SignChallengePermissionScope =
  PermissionScope<"icrc32_sign_challenge">;

export type Delegation = {
  pubkey: string;
  expiration: string;
  targets?: string[];
};

export type SignedDelegation = {
  delegation: Delegation;
  signature: string;
};

export const createSignChallengePermissionScope =
  (): SignChallengePermissionScope => ({
    method: "icrc32_sign_challenge",
  });

export type SignChallengeRequest = JsonRequest<
  "icrc32_sign_challenge",
  {
    principal: string;
    challenge: string;
  }
>;

export type SignChallengeResponse = JsonResponse<{
  publicKey: string;
  signature: string;
  signer_delegation?: SignedDelegation[];
}>;
