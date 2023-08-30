import { concat, PublicKey, requestIdOf, uint8ToBuf } from "@dfinity/agent";
import { DelegationChain } from "@dfinity/identity";
import { isSignatureValid } from "./challenge";

const DELEGATION_DOMAIN_SEP = new TextEncoder().encode(
  "\x1Aic-request-auth-delegation",
);

export const isIdentitySignatureValid = async (
  publicKey: PublicKey,
  challenge: Uint8Array,
  signature: Uint8Array,
  delegationChain?: DelegationChain,
): Promise<boolean> => {
  // Only need to check if signature is valid
  if (!delegationChain) {
    return isSignatureValid(
      new Uint8Array(publicKey.toDer()),
      new Uint8Array(signature),
      new Uint8Array(challenge),
    );
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
      !(await isSignatureValid(
        new Uint8Array(
          i === 0
            ? publicKey.toDer()
            : delegationChain.delegations[i - 1].delegation.pubkey,
        ),
        new Uint8Array(delegationChain.delegations[i].signature),
        new Uint8Array(
          concat(
            uint8ToBuf(DELEGATION_DOMAIN_SEP),
            requestIdOf(delegationChain.delegations[i].delegation),
          ),
        ),
      ))
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
  return isSignatureValid(
    new Uint8Array(signingPublicKey),
    new Uint8Array(signature),
    new Uint8Array(challenge),
  );
};
