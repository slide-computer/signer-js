import { p256 } from "@noble/curves/p256";
import { secp256k1 } from "@noble/curves/secp256k1";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { sha256 } from "@noble/hashes/sha256";
import { ED25519_OID, unwrapDER } from "@dfinity/identity";
import { Buffer } from "buffer";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

const ECDSA_P256_OID = Uint8Array.from([
  ...[0x30, 0x13], // SEQUENCE
  ...[0x06, 0x07], // OID with 7 bytes
  ...[0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01], // OID ECDSA
  ...[0x06, 0x08], // OID with 8 bytes
  ...[0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07], // OID P-256
]);

const SECP256K1_OID = Uint8Array.from([
  ...[0x30, 0x10], // SEQUENCE
  ...[0x06, 0x07], // OID with 7 bytes
  ...[0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01], // OID ECDSA
  ...[0x06, 0x05], // OID with 5 bytes
  ...[0x2b, 0x81, 0x04, 0x00, 0x0a], // OID secp256k1
]);

export const isSignatureValid = async (
  publicKey: Uint8Array,
  signature: Uint8Array,
  challenge: Uint8Array,
): Promise<boolean> => {
  try {
    if (publicKey[0] !== 0x30 || publicKey[2] !== 0x30) {
      return false;
    }
    const oidSequenceLength = publicKey[3];
    const oid = publicKey.slice(2, oidSequenceLength + 4);
    if (oid.length !== oidSequenceLength + 2) {
      return false;
    }
    switch (Array.from(oid).join()) {
      case Array.from(ECDSA_P256_OID).join():
        return p256.verify(
          Buffer.from(signature).toString("hex"),
          Buffer.from(sha256(challenge)).toString("hex"),
          Buffer.from(unwrapDER(publicKey, ECDSA_P256_OID)).toString("hex"),
        );
      case Array.from(ED25519_OID).join():
        return ed.verify(
          Buffer.from(signature).toString("hex"),
          Buffer.from(challenge).toString("hex"),
          Buffer.from(unwrapDER(publicKey, ED25519_OID)).toString("hex"),
        );
      case Array.from(SECP256K1_OID).join():
        return secp256k1.verify(
          Buffer.from(signature).toString("hex"),
          Buffer.from(sha256(challenge)).toString("hex"),
          Buffer.from(unwrapDER(publicKey, SECP256K1_OID)).toString("hex"),
        );
      default:
        return false;
    }
  } catch (_) {
    return false;
  }
};
