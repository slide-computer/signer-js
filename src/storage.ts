import { createStore, del, get, set, UseStore } from "idb-keyval";

export const KEY_STORAGE_KEY = "identity";
export const KEY_STORAGE_DELEGATION = "delegation";
export const KEY_VECTOR = "iv";
// Increment if any fields are modified
export const DB_VERSION = 1;

export const isBrowser = typeof window !== "undefined";

export type StoredKey = string | CryptoKeyPair;

/**
 * Interface for persisting user delegation data
 */
export interface SignerAgentStorage {
  get(key: string): Promise<StoredKey | undefined>;

  set(key: string, value: StoredKey): Promise<void>;

  remove(key: string): Promise<void>;
}

/**
 * Legacy implementation of SignerAgentStorage, for use where IndexedDb is not available
 */
export class LocalStorage implements SignerAgentStorage {
  constructor(
    public readonly prefix = "ic-",
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
 * @see implements {@link SignerAgentStorage}
 */
export class IdbStorage implements SignerAgentStorage {
  private _store?: UseStore;

  get store() {
    return this._store ?? createStore("signer-agent-db", "signer-agent-store");
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
