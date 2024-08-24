import { unwrapDER } from "@dfinity/identity";
import type { ValidateCanisterSignatureParams } from "./types";
import { Certificate } from "@dfinity/agent";
import { Principal } from "@dfinity/principal";
import { decode } from "./utils/cbor";

export const CANISTER_SIGNATURE_OID = Uint8Array.from([
  ...[0x30, 0x0c], // SEQUENCE
  ...[0x06, 0x0a], // OID with 10 bytes
  ...[0x2b, 0x06, 0x01, 0x04, 0x01, 0x83, 0xb8, 0x43, 0x01, 0x02], // OID DFINITY
]);


// TODO: validate challenge
export const isCanisterSignatureValid = async ({
  publicKey,
  signature,
  rootKey,
  blsVerify,
}: ValidateCanisterSignatureParams): Promise<boolean> => {
  const certificate = decode<Uint8Array>(signature.slice(16)).buffer;
  const rawKey = unwrapDER(publicKey, CANISTER_SIGNATURE_OID);
  const canisterId = Principal.fromUint8Array(rawKey.slice(1, 1 + rawKey[0]));
  return (
    Certificate.create({
      certificate,
      rootKey,
      canisterId,
      blsVerify,
    })
      .then(() => true)
      // Certificate creation throws if it's invalid
      .catch(() => false)
  );
};
