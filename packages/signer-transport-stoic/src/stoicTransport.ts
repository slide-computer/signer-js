import {type Channel, type Connection, type Transport,} from "@slide-computer/signer";
import {StoicChannel} from "./stoicChannel";
import {StoicConnection, type StoicConnectionOptions,} from "./stoicConnection";
import type {HttpAgent} from "@dfinity/agent";

export class StoicTransportError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, StoicTransportError.prototype);
  }
}

export interface StoicTransportOptions extends StoicConnectionOptions {
  /**
   * Optional, used to make canister calls
   * @default uses {@link HttpAgent} by default
   */
  agent?: HttpAgent;
}

export class StoicTransport implements Transport {
  static #isInternalConstructing: boolean = false;

  readonly #connection: StoicConnection;
  readonly #agent?: HttpAgent;

  private constructor(connection: StoicConnection, agent?: HttpAgent) {
    const throwError = !StoicTransport.#isInternalConstructing;
    StoicTransport.#isInternalConstructing = false;
    if (throwError) {
      throw new StoicTransportError("StoicTransport is not constructable");
    }
    this.#connection = connection;
    this.#agent = agent;
  }

  get connection(): Connection {
    return this.#connection;
  }

  static async create(
    options?: StoicTransportOptions,
  ): Promise<StoicTransport> {
    const connection = await StoicConnection.create(options);

    StoicTransport.#isInternalConstructing = true;
    return new StoicTransport(connection, options?.agent);
  }

  async establishChannel(): Promise<Channel> {
    if (!this.#connection.connected) {
      throw new StoicTransportError("StoicTransport is not connected");
    }
    return new StoicChannel(this.#connection, this.#agent);
  }
}
