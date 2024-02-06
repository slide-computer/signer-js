import { JsonRequest, JsonResponse, Transport } from "./types";

export interface MixedTransportOptions {
  incoming: Pick<Transport, "registerListener">;
  outgoing: Pick<Transport, "send">;
}

export class MixedTransport implements Transport {
  constructor(private options: MixedTransportOptions) {}

  public async registerListener(
    listener: (responses: JsonResponse[]) => Promise<void>,
  ): Promise<() => void> {
    return this.options.incoming.registerListener(listener);
  }

  public async send(requests: JsonRequest[]): Promise<void> {
    return this.options.outgoing.send(requests);
  }
}
