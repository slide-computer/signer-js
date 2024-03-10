import type { ValidateChallengeSignatureParams } from "./types";
import { Buffer } from "buffer";
import { unwrapDER } from "@dfinity/identity";
import { sha256 } from "@noble/hashes/sha256";
import { p256 } from "@noble/curves/p256";

export const ECDSA_P256_OID = Uint8Array.from([
  ...[0x30, 0x13], // SEQUENCE
  ...[0x06, 0x07], // OID with 7 bytes
  ...[0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01], // OID ECDSA
  ...[0x06, 0x08], // OID with 8 bytes
  ...[0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07], // OID P-256
]);

export const isECDSASignatureValid = async ({
  publicKey,
  signature,
  challenge,
}: ValidateChallengeSignatureParams): Promise<boolean> =>
  p256.verify(
    Buffer.from(signature).toString("hex"),
    Buffer.from(sha256(new Uint8Array(challenge))).toString("hex"),
    Buffer.from(unwrapDER(publicKey, ECDSA_P256_OID)).toString("hex"),
  );
