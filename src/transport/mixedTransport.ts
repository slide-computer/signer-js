import { JsonRPC, Transport } from "./types";

export interface MixedTransportOptions {
  incoming: Pick<Transport, "registerListener">;
  outgoing: Pick<Transport, "send">;
}

export class MixedTransport implements Transport {
  constructor(private options: MixedTransportOptions) {}

  public async registerListener<Data extends JsonRPC = JsonRPC>(
    listener: (data: Data) => Promise<void>,
  ): Promise<() => void> {
    return this.options.incoming.registerListener(listener);
  }

  public async send<Data extends JsonRPC = JsonRPC>(data: Data): Promise<void> {
    return this.options.outgoing.send(data);
  }
}
