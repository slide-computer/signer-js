import type {
  ValidateCanisterSignatureParams,
  ValidateChallengeSignatureParams,
} from "./types";
import { DelegationChain } from "@dfinity/identity";
import { isSignatureValid } from "./index";
import { concat, requestIdOf } from "@dfinity/agent";

export interface ValidateIdentitySignatureParams
  extends ValidateChallengeSignatureParams,
    ValidateCanisterSignatureParams {
  delegationChain?: DelegationChain;
}

export const DELEGATION_DOMAIN_SEP = new TextEncoder().encode(
  "\x1Aic-request-auth-delegation",
);

export const isIdentitySignatureValid = async ({
  publicKey,
  signature,
  challenge,
  rootKey,
  delegationChain,
}: ValidateIdentitySignatureParams): Promise<boolean> => {
  // Only need to check if signature is valid
  if (!delegationChain) {
    return isSignatureValid({ publicKey, signature, challenge, rootKey });
  }

  // A delegation chain without delegations cannot be valid
  if (delegationChain.delegations.length === 0) {
    return false;
  }

  // Check if the whole delegation chain is valid by looping through it and checking one by one
  for (let i = 0; i < delegationChain.delegations.length; i++) {
    // Check expiration
    if (
      new Date(
        Number(
          delegationChain.delegations[i].delegation.expiration /
            BigInt(1000000),
        ),
      ).getTime() <= Date.now()
    ) {
      return false;
    }
    // Check if signature is valid
    if (
      !(await isSignatureValid({
        publicKey:
          i === 0
            ? publicKey
            : delegationChain.delegations[i - 1].delegation.pubkey,
        signature: delegationChain.delegations[i].signature,
        challenge: concat(
          DELEGATION_DOMAIN_SEP.buffer,
          requestIdOf({ ...delegationChain.delegations[i].delegation }),
        ),
        rootKey,
      }))
    ) {
      return false;
    }
  }

  // Check the validity of either the complete delegation chain or a subset of it starting from the beginning
  let signingPublicKey: ArrayBuffer | undefined;
  for (const { delegation } of delegationChain.delegations) {
    // If a delegation has targets, it's invalid as proof of ownership of the private key of the identity,
    // we check the subset before it since the delegation at the end is expected to have signed the challenge
    if (delegation.targets) {
      break;
    }
    signingPublicKey = delegation.pubkey;
  }

  // A valid delegation chain or subset of it could not be found
  if (!signingPublicKey) {
    return false;
  }

  // Check if chain up till now is a valid delegation chain for the challenge
  return isSignatureValid({
    publicKey: signingPublicKey,
    signature,
    challenge,
    rootKey,
  });
};
