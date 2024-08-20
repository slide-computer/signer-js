import type { Connection } from "@slide-computer/signer";
import { StoicTransportError } from "./stoicTransport";
import {
  Delegation,
  DelegationChain,
  ECDSAKeyIdentity,
  Ed25519KeyIdentity,
  isDelegationValid,
} from "@dfinity/identity";
import {
  getDelegationChain,
  getIdentity,
  IdbStorage,
  removeDelegationChain,
  setDelegationChain,
  setIdentity,
  type SignerStorage,
} from "@slide-computer/signer-storage";
import { fromHex, requestIdOf, SignIdentity, toHex } from "@dfinity/agent";
import { PartialIdentity } from "@dfinity/identity/lib/cjs/identity/partial";
import { Principal } from "@dfinity/principal";

const ECDSA_KEY_LABEL = "ECDSA";
const ED25519_KEY_LABEL = "Ed25519";
type BaseKeyType = typeof ECDSA_KEY_LABEL | typeof ED25519_KEY_LABEL;

const IDENTITY_STORAGE_KEY = "stoic-base-identity";
const DELEGATION_STORAGE_KEY = "stoic-delegation-chain";
const ACCOUNTS_STORAGE_KEY = "stoic-account-count";
const STOIC_ORIGIN = "https://www.stoicwallet.com";
const STOIC_WINDOW = "stoic";

export interface StoicConnectionOptions {
  /**
   * Expiration of the connection in nanoseconds
   * @default BigInt(8) hours * BigInt(3_600_000_000_000) nanoseconds
   */
  maxTimeToLive?: bigint;
  /**
   * An {@link SignIdentity} or {@link PartialIdentity} to authenticate via delegation.
   */
  identity?: SignIdentity | PartialIdentity;
  /**
   * type to use for the base key
   * @default 'ECDSA'
   * If you are using a custom storage provider that does not support CryptoKey storage,
   * you should use 'Ed25519' as the key type, as it can serialize to a string
   */
  keyType?: BaseKeyType;
  /**
   * Optional storage with get, set, and remove
   * @default Uses {@link IdbStorage} by default
   */
  storage?: SignerStorage;
  /**
   * Optional, used to generate random bytes and Stoic app CryptoKeyPair
   * @default globalThis.crypto
   */
  crypto?: Pick<Crypto, "getRandomValues" | "subtle">;
  /**
   * Disconnect monitoring interval in ms
   * @default 3000
   */
  disconnectMonitoringInterval?: number;
}

export class StoicConnection implements Connection {
  static #isInternalConstructing: boolean = false;

  readonly #options: Required<StoicConnectionOptions>;
  #delegationChain?: DelegationChain;
  #accounts?: number;
  #disconnectListeners = new Set<() => void>();
  #disconnectMonitorInterval?: ReturnType<typeof setInterval>;

  constructor(
    options: Required<StoicConnectionOptions>,
    delegationChain?: DelegationChain,
    accounts?: number,
  ) {
    const throwError = !StoicConnection.#isInternalConstructing;
    StoicConnection.#isInternalConstructing = false;
    if (throwError) {
      throw new StoicTransportError("StoicTransport is not constructable");
    }
    this.#options = options;
    this.#delegationChain = delegationChain;
    this.#accounts = accounts;
    if (this.connected) {
      this.#monitorDisconnect();
    }
  }

  get connected() {
    if (!this.#delegationChain) {
      return false;
    }
    return isDelegationValid(this.#delegationChain);
  }

  get identity() {
    return this.#options.identity as SignIdentity;
  }

  get delegationChain() {
    return this.#delegationChain;
  }

  get accounts() {
    return this.#accounts;
  }

  static async create(
    options?: StoicConnectionOptions,
  ): Promise<StoicConnection> {
    const maxTimeToLive =
      options?.maxTimeToLive ?? BigInt(8) * BigInt(3_600_000_000_000);
    const keyType = options?.keyType ?? ECDSA_KEY_LABEL;
    const storage = options?.storage ?? new IdbStorage();
    const crypto = options?.crypto ?? globalThis.crypto;
    const disconnectMonitoringInterval =
      options?.disconnectMonitoringInterval ?? 3000;
    let identity =
      options?.identity ?? (await getIdentity(IDENTITY_STORAGE_KEY, storage));
    if (!identity) {
      const createdIdentity = await (keyType === "Ed25519"
        ? Ed25519KeyIdentity.generate(
            crypto.getRandomValues(new Uint8Array(32)),
          )
        : ECDSAKeyIdentity.generate());
      await setIdentity(IDENTITY_STORAGE_KEY, createdIdentity, storage);
      identity = createdIdentity;
    }
    const delegationChain = await getDelegationChain(
      DELEGATION_STORAGE_KEY,
      storage,
    );
    const accounts = await storage.get(ACCOUNTS_STORAGE_KEY);

    StoicConnection.#isInternalConstructing = true;
    return new StoicConnection(
      {
        maxTimeToLive,
        keyType,
        identity,
        storage,
        crypto,
        disconnectMonitoringInterval,
      },
      delegationChain,
      accounts ? Number(accounts) : undefined,
    );
  }

  async connect(): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
      this.#delegationChain = undefined;
      const keypair: { current?: CryptoKeyPair } = {
        current: await this.#options.crypto.subtle.generateKey(
          {
            name: "ECDSA",
            namedCurve: "P-384",
          },
          false,
          ["sign", "verify"],
        ),
      };
      const apikey = toHex(
        await this.#options.crypto.subtle.exportKey(
          "spki",
          keypair.current!.publicKey,
        ),
      );
      const tunnel = document.createElement("iframe");
      tunnel.width = "0";
      tunnel.height = "0";
      tunnel.style.borderWidth = "0";
      const delegation = new Delegation(
        this.#options.identity.getPublicKey().toDer(),
        BigInt(Date.now()) * BigInt(1_000_000) + this.#options.maxTimeToLive,
      );
      let publicKey: ArrayBuffer;
      const complete = async () => {
        window.removeEventListener("message", listener);
        document.body.removeChild(tunnel);
        await setDelegationChain(
          DELEGATION_STORAGE_KEY,
          this.#delegationChain!,
          this.#options.storage,
        );
        await this.#options.storage.set(
          ACCOUNTS_STORAGE_KEY,
          `${this.#accounts}`,
        );
        this.#monitorDisconnect();
        resolve();
      };
      const listener = (event: MessageEvent) => {
        if (!stoicWindow || event.origin !== STOIC_ORIGIN) {
          return;
        }
        if (
          event.source === tunnel.contentWindow &&
          event.data.target === "STOIC-EXT"
        ) {
          if (!event.data.success) {
            window.removeEventListener("message", listener);
            document.body.removeChild(tunnel);
            reject(new StoicTransportError(event.data.data));
            return;
          }
          switch (event.data.action) {
            case "accounts":
              this.#accounts = JSON.parse(event.data.data).length;
              if (this.#delegationChain) {
                complete();
              }
              break;
            case "sign":
              const data = JSON.parse(event.data.data);
              const signature = fromHex(data.signed);
              const previousDelegationChain =
                data.chain && DelegationChain.fromJSON(data.chain);
              this.#delegationChain = DelegationChain.fromDelegations(
                [
                  ...(previousDelegationChain?.delegations ?? []),
                  { delegation, signature },
                ],
                publicKey,
              );
              if (this.#accounts) {
                complete();
              }
              break;
          }
          return;
        }
        if (event.source !== stoicWindow) {
          // All events below are expected to be received from stoicWindow
          return;
        }
        switch (event.data.action) {
          case "initiateStoicConnect":
            // Request connection when window indicates its ready
            stoicWindow.postMessage(
              { action: "requestAuthorization", apikey },
              STOIC_ORIGIN,
            );
            break;
          case "rejectAuthorization":
            // If the connection is rejected, throw an error
            stoicWindow.close();
            window.removeEventListener("message", listener);
            reject(new StoicTransportError("Connection is rejected"));
            break;
          case "confirmAuthorization":
            // Get public key from event
            publicKey = new Uint8Array(Object.values(event.data.key)).buffer;
            const principal = Principal.selfAuthenticating(
              new Uint8Array(publicKey),
            ).toText();

            // Once the connection has been approved, close window
            // and create iframe to get accounts and a delegation.
            stoicWindow.close();
            document.body.appendChild(tunnel);
            tunnel.onload = async () => {
              if (!tunnel.contentWindow) {
                reject(
                  new StoicTransportError("Tunnel could not be established"),
                );
                return;
              }
              // Request accounts
              tunnel.contentWindow.postMessage(
                {
                  target: "STOIC-IFRAME",
                  action: "accounts",
                  payload: "accounts",
                  principal,
                  apikey,
                  sig: toHex(
                    await window.crypto.subtle.sign(
                      {
                        name: "ECDSA",
                        hash: { name: "SHA-384" },
                      },
                      keypair.current!.privateKey,
                      new TextEncoder().encode("accounts"),
                    ),
                  ),
                },
                STOIC_ORIGIN,
              );
              // Request delegation signature
              const challenge = toHex(
                new Uint8Array([
                  ...new TextEncoder().encode("\x1Aic-request-auth-delegation"),
                  ...new Uint8Array(requestIdOf(delegation)),
                ]).buffer,
              );
              tunnel.contentWindow.postMessage(
                {
                  target: "STOIC-IFRAME",
                  action: "sign",
                  payload: challenge,
                  principal,
                  apikey,
                  sig: toHex(
                    await window.crypto.subtle.sign(
                      {
                        name: "ECDSA",
                        hash: { name: "SHA-384" },
                      },
                      keypair.current!.privateKey,
                      new TextEncoder().encode(challenge),
                    ),
                  ),
                },
                STOIC_ORIGIN,
              );

              // Delete key pair after usage since its considered an unacceptable risk
              // to keep a key around that gives full signing access to Stoic Wallet.
              //
              // It could be abused for example to create a delegation with an (in practice)
              // indefinite expiration. By creating a delegation with a definite expiration
              // and deleting the key pair, the risk is limited to a definite timeframe.
              //
              // Keep in mind other dapps could still abuse their own key pair for various malicious
              // purposes, Stoic Wallet should be considered insecure for holding high value assets.
              delete keypair.current;
            };
            tunnel.src = new URL("?stoicTunnel", STOIC_ORIGIN).href;
            break;
        }
      };
      window.addEventListener("message", listener);

      // Open window to request connection
      const stoicWindow = window.open(
        new URL("?authorizeApp", STOIC_ORIGIN),
        STOIC_WINDOW,
      );
    });
  }

  async disconnect(): Promise<void> {
    clearInterval(this.#disconnectMonitorInterval);
    await removeDelegationChain(DELEGATION_STORAGE_KEY, this.#options.storage);
    await this.#options.storage.remove(ACCOUNTS_STORAGE_KEY);
    this.#delegationChain = undefined;
    this.#accounts = undefined;
    this.#disconnectListeners.forEach((listener) => listener());
  }

  addEventListener(event: "disconnect", listener: () => void): () => void {
    switch (event) {
      case "disconnect":
        this.#disconnectListeners.add(listener);
        return () => {
          this.#disconnectListeners.delete(listener);
        };
    }
  }

  #monitorDisconnect() {
    this.#disconnectMonitorInterval = setInterval(() => {
      if (!this.connected) {
        this.#disconnectListeners.forEach((listener) => listener());
        clearInterval(this.#disconnectMonitorInterval);
      }
    }, this.#options.disconnectMonitoringInterval);
  }
}
