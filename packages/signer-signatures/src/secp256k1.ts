import type { ValidateChallengeSignatureParams } from "./types";
import { Buffer } from "buffer";
import { sha256 } from "@noble/hashes/sha256";
import { unwrapDER } from "@dfinity/identity";
import { secp256k1 } from "@noble/curves/secp256k1";

export const SECP256K1_OID = Uint8Array.from([
  ...[0x30, 0x10], // SEQUENCE
  ...[0x06, 0x07], // OID with 7 bytes
  ...[0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01], // OID ECDSA
  ...[0x06, 0x05], // OID with 5 bytes
  ...[0x2b, 0x81, 0x04, 0x00, 0x0a], // OID secp256k1
]);

export const isSecp256k1SignatureValid = async ({
  publicKey,
  signature,
  challenge,
}: ValidateChallengeSignatureParams): Promise<boolean> => {
  return secp256k1.verify(
    Buffer.from(signature).toString("hex"),
    Buffer.from(sha256(new Uint8Array(challenge))).toString("hex"),
    Buffer.from(unwrapDER(publicKey, SECP256K1_OID)).toString("hex"),
  );
};
