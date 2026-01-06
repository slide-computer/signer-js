import type { AuthClient, AuthClientLoginOptions } from "@icp-sdk/auth/client";
import { DelegationIdentity, isDelegationValid } from "@icp-sdk/core/identity";
import type { Connection } from "@slide-computer/signer";
import { AuthClientTransportError } from "./authClientTransport.js";

interface AuthClientConnectionOptions {
  /**
   * AuthClient instance from "@icp-sdk/core/auth-client"
   */
  authClient: AuthClient;
  /**
   * Login options used to log in with AuthClient instance
   */
  authClientLoginOptions?: AuthClientLoginOptions;
  /**
   * Auth Client disconnect monitoring interval in ms
   * @default 3000
   */
  authClientDisconnectMonitoringInterval?: number;
}

export class AuthClientConnection implements Connection {
  #options: Required<AuthClientConnectionOptions>;
  #disconnectListeners = new Set<() => void>();
  #disconnectMonitorInterval?: ReturnType<typeof setInterval>;

  constructor(options: AuthClientConnectionOptions) {
    this.#options = {
      authClientLoginOptions: {},
      authClientDisconnectMonitoringInterval: 3000,
      ...options,
    };
    if (this.connected) {
      this.#monitorDisconnect();
    }
  }

  get connected() {
    const identity = this.#options.authClient.getIdentity();
    if (identity.getPrincipal().isAnonymous()) {
      return false;
    }
    const delegationIdentity = identity as DelegationIdentity;
    return isDelegationValid(delegationIdentity.getDelegation());
  }

  async connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.#options.authClient.login({
        ...this.#options.authClientLoginOptions,
        onSuccess: () => {
          this.#monitorDisconnect();
          resolve();
        },
        onError: (error) =>
          reject(
            new AuthClientTransportError(error ?? "AuthClient login failed"),
          ),
      });
    });
  }

  async disconnect(): Promise<void> {
    clearInterval(this.#disconnectMonitorInterval);
    await this.#options.authClient.logout();
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
    }, this.#options.authClientDisconnectMonitoringInterval);
  }
}
