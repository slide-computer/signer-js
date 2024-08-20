import {type Channel, type Transport,} from "@slide-computer/signer";
import {PlugChannel} from "./plugChannel";

export class PlugTransportError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, PlugTransportError.prototype);
  }
}

export class PlugTransport implements Transport {
  async establishChannel(): Promise<Channel> {
    return new PlugChannel();
  }
}
