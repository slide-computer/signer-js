import type { JsonRequest, JsonResponse, Transport } from "./types";

export interface MixedTransportOptions {
  incoming: Pick<Transport, "registerListener">;
  outgoing: Pick<Transport, "send">;
}

export class MixedTransport implements Transport {
  constructor(private options: MixedTransportOptions) {}

  public registerListener(
    listener: (response: JsonResponse) => Promise<void>,
  ): () => void {
    return this.options.incoming.registerListener(listener);
  }

  public async send(request: JsonRequest): Promise<void> {
    return this.options.outgoing.send(request);
  }
}
