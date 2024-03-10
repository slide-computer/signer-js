import { DelegationChain } from "@dfinity/identity";
import type { SignerStorage } from "./storage";

export const getDelegationChain = async (
  key: string,
  storage: SignerStorage,
) => {
  const json = await storage.get(`delegation-${key}`);
  if (!json || typeof json !== "string") {
    return;
  }
  return DelegationChain.fromJSON(json);
};

export const setDelegationChain = async (
  key: string,
  delegationChain: DelegationChain,
  storage: SignerStorage,
) => {
  return storage.set(
    `delegation-${key}`,
    JSON.stringify(delegationChain.toJSON()),
  );
};

export const removeDelegationChain = async (
  key: string,
  storage: SignerStorage,
) => {
  return storage.remove(`delegation-${key}`);
};
