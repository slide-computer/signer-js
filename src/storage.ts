import { createStore, del, get, set, UseStore } from "idb-keyval";
import {
  DelegationChain,
  ECDSAKeyIdentity,
  Ed25519KeyIdentity,
} from "@dfinity/identity";

export type StoredKey = string | CryptoKeyPair;

/**
 * Interface for persisting user delegation data
 */
export interface SignerStorage {
  get(key: string): Promise<StoredKey | undefined>;

  set(key: string, value: StoredKey): Promise<void>;

  remove(key: string): Promise<void>;
}

/**
 * Legacy implementation of SignerStorage, for use where IndexedDb is not available
 */
export class LocalStorage implements SignerStorage {
  constructor(
    public readonly prefix = "signer-",
    private readonly _localStorage?: Storage,
  ) {}

  public async get(key: string) {
    return this._getLocalStorage().getItem(this.prefix + key) ?? undefined;
  }

  public async set(key: string, value: string) {
    this._getLocalStorage().setItem(this.prefix + key, value);
  }

  public async remove(key: string) {
    this._getLocalStorage().removeItem(this.prefix + key);
  }

  private _getLocalStorage(): Storage {
    if (this._localStorage) {
      return this._localStorage;
    }

    const ls =
      typeof window === "undefined"
        ? // @ts-ignore
          typeof global === "undefined"
          ? typeof self === "undefined"
            ? undefined
            : self.localStorage
          : // @ts-ignore
            global.localStorage
        : window.localStorage;

    if (!ls) {
      throw new Error("Could not find local storage.");
    }

    return ls;
  }
}

/**
 * IdbStorage is an interface for simple storage of string key-value pairs built on idb-keyval
 *
 * It replaces {@link LocalStorage}
 * @see implements {@link SignerStorage}
 */
export class IdbStorage implements SignerStorage {
  private _store?: UseStore;

  get store() {
    if (!this._store) {
      this._store = createStore("signer-db", "signer-store");
    }
    return this._store;
  }

  public async get(key: string) {
    return get<string>(key, this.store);
  }

  public async set(key: string, value: string) {
    return set(key, value, this.store);
  }

  public async remove(key: string) {
    return del(key, this.store);
  }
}

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
