import { CreateCertificateOptions } from "@dfinity/agent";

export interface ValidateSignatureParams {
  publicKey: ArrayBuffer;
  signature: ArrayBuffer;
}

export interface ValidateChallengeSignatureParams
  extends ValidateSignatureParams {
  challenge: ArrayBuffer;
}

export interface ValidateCanisterSignatureParams
  extends ValidateSignatureParams {
  rootKey: ArrayBuffer;
  blsVerify?: CreateCertificateOptions["blsVerify"];
}
