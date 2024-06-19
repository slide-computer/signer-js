import { AuthClient, type AuthClientLoginOptions } from "@dfinity/auth-client";
import {
  type Channel,
  type Connection,
  type Transport,
} from "@slide-computer/signer";
import { AuthClientChannel } from "./authClientChannel";
import { AuthClientConnection } from "./authClientConnection";

export class AuthClientTransportError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, AuthClientTransportError.prototype);
  }
}

type AuthClientCreateOptions = Parameters<typeof AuthClient.create>[0];

export interface AuthClientTransportOptions {
  /**
   * Options used to create AuthClient instance
   */
  authClientCreateOptions?: AuthClientCreateOptions;
  /**
   * Options used to log in with AuthClient instance
   */
  authClientLoginOptions?: AuthClientLoginOptions;
  /**
   * Auth Client disconnect monitoring interval in ms
   * @default 3000
   */
  authClientDisconnectMonitoringInterval?: number;
}

export class AuthClientTransport implements Transport {
  static #isInternalConstructing: boolean = false;

  readonly #connection: Connection;
  readonly #authClient: AuthClient;

  private constructor(authClient: AuthClient, connection: Connection) {
    if (!AuthClientTransport.#isInternalConstructing) {
      throw new AuthClientTransportError(
        "AuthClientTransport is not constructable",
      );
    }
    AuthClientTransport.#isInternalConstructing = false;
    this.#authClient = authClient;
    this.#connection = connection;
  }

  get connection(): Connection {
    return this.#connection;
  }

  async create(
    options: AuthClientTransportOptions,
  ): Promise<AuthClientTransport> {
    const authClient = await AuthClient.create(options.authClientCreateOptions);
    const connection = new AuthClientConnection({
      authClient,
      authClientLoginOptions: options.authClientLoginOptions,
      authClientDisconnectMonitoringInterval:
        options.authClientDisconnectMonitoringInterval,
    });

    AuthClientTransport.#isInternalConstructing = true;
    return new AuthClientTransport(authClient, connection);
  }

  async establishChannel(): Promise<Channel> {
    if (!this.#connection.connected) {
      throw new AuthClientTransportError(
        "AuthClientTransport is not connected",
      );
    }
    return new AuthClientChannel({
      authClient: this.#authClient,
      connection: this.#connection,
    });
  }
}
