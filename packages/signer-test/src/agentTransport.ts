import { type Channel, type Transport } from "@slide-computer/signer";
import { AgentChannel } from "./agentChannel";
import { HttpAgent } from "@dfinity/agent";

export class AgentTransportError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, AgentTransportError.prototype);
  }
}

export interface AgentTransportOptions {
  /**
   * Used to make canister calls
   * @default uses anonymous {@link HttpAgent} by default
   */
  agent: HttpAgent;
}

export class AgentTransport implements Transport {
  static #isInternalConstructing: boolean = false;
  readonly #agent: HttpAgent;

  private constructor(agent: HttpAgent) {
    const throwError = !AgentTransport.#isInternalConstructing;
    AgentTransport.#isInternalConstructing = false;
    if (throwError) {
      throw new AgentTransportError("AgentTransport is not constructable");
    }
    this.#agent = agent;
  }

  static async create(
    options?: AgentTransportOptions,
  ): Promise<AgentTransport> {
    const agent = options?.agent ?? (await HttpAgent.create());

    AgentTransport.#isInternalConstructing = true;
    return new AgentTransport(agent);
  }

  async establishChannel(): Promise<Channel> {
    return new AgentChannel(this.#agent);
  }
}
