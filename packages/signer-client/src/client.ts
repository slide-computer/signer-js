import {
  AnonymousIdentity,
  type Identity,
  type SignIdentity,
} from "@dfinity/agent";
import {
  DelegationChain,
  DelegationIdentity,
  ECDSAKeyIdentity,
  Ed25519KeyIdentity,
  isDelegationValid,
  PartialDelegationIdentity,
  PartialIdentity,
} from "@dfinity/identity";
import type { Signer } from "@slide-computer/signer";
import {
  getDelegationChain,
  getIdentity,
  IdbStorage,
  removeDelegationChain,
  removeIdentity,
  setDelegationChain,
  setIdentity,
  type SignerStorage,
} from "@slide-computer/signer-storage";
import { IdleManager, type IdleManagerOptions } from "./idleManager";

const ECDSA_KEY_LABEL = "ECDSA";
const ED25519_KEY_LABEL = "Ed25519";
type BaseKeyType = typeof ECDSA_KEY_LABEL | typeof ED25519_KEY_LABEL;

const STORAGE_KEY = "client";

export interface IdleOptions extends IdleManagerOptions {
  /**
   * Disables idle functionality for {@link IdleManager}
   * @default false
   */
  disableIdle?: boolean;

  /**
   * Disables default idle behavior - call logout & reload window
   * @default false
   */
  disableDefaultIdleCallback?: boolean;
}

export interface SignerClientOptions {
  signer: Signer;
  /**
   * An identity to use as the base
   */
  identity?: SignIdentity;
  /**
   * Optional, used to generate random bytes
   * @default uses browser/node Crypto by default
   */
  crypto?: Pick<Crypto, "getRandomValues">;
  /**
   * Optional storage with get, set, and remove. Uses {@link IdbStorage} by default
   */
  storage?: SignerStorage;
  /**
   * type to use for the base key
   * @default 'ECDSA'
   * If you are using a custom storage provider that does not support CryptoKey storage,
   * you should use 'Ed25519' as the key type, as it can serialize to a string
   */
  keyType?: BaseKeyType;
  /**
   * Options to handle idle timeouts
   * @default after 30 minutes, invalidates the identity
   */
  idleOptions?: IdleOptions;
}

export class SignerClient {
  private idleManager: IdleManager | undefined = undefined;

  constructor(
    private options: SignerClientOptions,
    private storage: SignerStorage,
    private baseIdentity: SignIdentity,
    private identity: Identity | PartialIdentity,
  ) {
    if (this.isAuthenticated() && !options?.idleOptions?.disableIdle) {
      this.idleManager = IdleManager.create(options.idleOptions);
      this.registerDefaultIdleCallback();
    }
  }

  private get crypto(): Pick<Crypto, "getRandomValues"> {
    return this.options.crypto ?? globalThis.crypto;
  }

  public static async create(
    options: SignerClientOptions,
  ): Promise<SignerClient> {
    const crypto = options.crypto ?? globalThis.crypto;
    const storage = options.storage ?? new IdbStorage();
    let baseIdentity =
      options.identity ?? (await getIdentity(STORAGE_KEY, storage));
    if (!baseIdentity) {
      const createdBaseIdentity = await (options?.keyType === "Ed25519"
        ? Ed25519KeyIdentity.generate(
            crypto.getRandomValues(new Uint8Array(32)),
          )
        : ECDSAKeyIdentity.generate());
      await setIdentity(STORAGE_KEY, createdBaseIdentity, storage);
      baseIdentity = createdBaseIdentity;
    }
    const delegationChain = await getDelegationChain(STORAGE_KEY, storage);
    const identity =
      baseIdentity && delegationChain && isDelegationValid(delegationChain)
        ? SignerClient.createIdentity(baseIdentity, delegationChain)
        : new AnonymousIdentity();
    return new SignerClient(options, storage, baseIdentity, identity);
  }

  private static createIdentity(
    baseIdentity: SignIdentity | PartialIdentity,
    delegationChain: DelegationChain,
  ) {
    if (baseIdentity instanceof PartialIdentity) {
      return PartialDelegationIdentity.fromDelegation(
        baseIdentity,
        delegationChain,
      );
    }
    return DelegationIdentity.fromDelegation(baseIdentity, delegationChain);
  }

  public getIdentity(): Identity {
    return this.identity;
  }

  public isAuthenticated(): boolean {
    return !this.getIdentity().getPrincipal().isAnonymous();
  }

  public async login(options?: {
    /**
     * Expiration of the authentication in nanoseconds
     * @default  BigInt(8) hours * BigInt(3_600_000_000_000) nanoseconds
     */
    maxTimeToLive?: bigint;
    /**
     * Callback once login has completed
     */
    onSuccess?: (() => void) | (() => Promise<void>);
    /**
     * Callback in case authentication fails
     */
    onError?: ((error?: Error) => void) | ((error?: Error) => Promise<void>);
  }): Promise<void> {
    try {
      const delegationChain = await this.options.signer.delegation({
        publicKey: this.baseIdentity.getPublicKey().toDer(),
        maxTimeToLive: options?.maxTimeToLive,
      });
      await setDelegationChain(STORAGE_KEY, delegationChain, this.storage);
      this.identity = SignerClient.createIdentity(
        this.baseIdentity,
        delegationChain,
      );
      if (!this.options?.idleOptions?.disableIdle && !this.idleManager) {
        this.idleManager = IdleManager.create(this.options.idleOptions);
        this.registerDefaultIdleCallback();
      }
      options?.onSuccess?.();
    } catch (e) {
      if (e instanceof Error) {
        options?.onError?.(e);
      }
    }
  }

  public async logout(options: { returnTo?: string } = {}): Promise<void> {
    await removeIdentity(STORAGE_KEY, this.storage);
    await removeDelegationChain(STORAGE_KEY, this.storage);
    this.identity = new AnonymousIdentity();
    this.idleManager?.exit();
    this.idleManager = undefined;
    if (options.returnTo) {
      try {
        window.history.pushState({}, "", options.returnTo);
      } catch (e) {
        window.location.href = options.returnTo;
      }
    }
  }

  private registerDefaultIdleCallback() {
    /**
     * Default behavior is to clear stored identity and reload the page.
     * By either setting the disableDefaultIdleCallback flag or passing in a custom idle callback, we will ignore this config
     */
    if (
      !this.options?.idleOptions?.onIdle &&
      !this.options?.idleOptions?.disableDefaultIdleCallback
    ) {
      this.idleManager?.registerCallback(async () => {
        await this.logout();
        location.reload();
      });
    }
  }
}
