import { ECDSAKeyIdentity, Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import type { SignerStorage } from "./storage.js";

export const getIdentity = async (key: string, storage: SignerStorage) => {
  const value = await storage.get(`identity-${key}`);
  if (!value) {
    return;
  }
  return typeof value === "string"
    ? Ed25519KeyIdentity.fromJSON(value)
    : ECDSAKeyIdentity.fromKeyPair(value);
};

export const setIdentity = async (
  key: string,
  identity: Ed25519KeyIdentity | ECDSAKeyIdentity,
  storage: SignerStorage,
) => {
  const value =
    identity instanceof Ed25519KeyIdentity
      ? JSON.stringify(identity.toJSON())
      : identity.getKeyPair();
  return storage.set(`identity-${key}`, value);
};

export const removeIdentity = async (key: string, storage: SignerStorage) => {
  return storage.remove(`identity-${key}`);
};
