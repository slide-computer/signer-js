import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { ValidateChallengeSignatureParams } from "./types";
import { Buffer } from "buffer";
import { ED25519_OID, unwrapDER } from "@dfinity/identity";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

export const isEd25519SignatureValid = async ({
  publicKey,
  signature,
  challenge,
}: ValidateChallengeSignatureParams): Promise<boolean> =>
  ed.verifyAsync(
    Buffer.from(signature).toString("hex"),
    Buffer.from(challenge).toString("hex"),
    Buffer.from(unwrapDER(publicKey, ED25519_OID)).toString("hex"),
  );

export { ED25519_OID } from "@dfinity/identity";
