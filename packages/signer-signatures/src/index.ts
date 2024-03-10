import { compare } from "@dfinity/agent";
import type {
  ValidateCanisterSignatureParams,
  ValidateChallengeSignatureParams,
} from "./types";
import { ECDSA_P256_OID, isECDSASignatureValid } from "./p256";
import { ED25519_OID, isEd25519SignatureValid } from "./ed25519";
import { isSecp256k1SignatureValid, SECP256K1_OID } from "./secp256k1";
import { CANISTER_SIGNATURE_OID, isCanisterSignatureValid } from "./canister";

export const isSignatureValid = (
  params: ValidateChallengeSignatureParams & ValidateCanisterSignatureParams,
) => {
  try {
    const publicKey = new Uint8Array(params.publicKey);
    if (publicKey[0] !== 0x30 || publicKey[2] !== 0x30) {
      return false;
    }
    const oidSequenceLength = publicKey[3];
    const oid = publicKey.slice(2, oidSequenceLength + 4);
    if (oid.byteLength !== oidSequenceLength + 2) {
      return false;
    }
    if (compare(oid, ECDSA_P256_OID.buffer) === 0) {
      return isECDSASignatureValid(params);
    }
    if (compare(oid, ED25519_OID.buffer) === 0) {
      return isEd25519SignatureValid(params);
    }
    if (compare(oid, SECP256K1_OID.buffer) === 0) {
      return isSecp256k1SignatureValid(params);
    }
    if (compare(oid, CANISTER_SIGNATURE_OID.buffer) === 0) {
      return isCanisterSignatureValid(params);
    }
    return false;
  } catch (_) {
    return false;
  }
};

export * from "./types";
export * from "./identity";
export * from "./p256";
export * from "./ed25519";
export * from "./secp256k1";
export * from "./canister";
