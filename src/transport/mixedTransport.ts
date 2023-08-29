import { JsonRequest, JsonResponse, Transport } from "../types";

export interface MixedTransportOptions {
  incoming: Pick<Transport, "registerListener">;
  outgoing: Pick<Transport, "send">;
}

export class MixedTransport implements Transport {
  constructor(private options: MixedTransportOptions) {}

  public async registerListener<Response extends JsonResponse = JsonResponse>(
    listener: (response: Response) => Promise<void>,
  ): Promise<() => void> {
    return this.options.incoming.registerListener(listener);
  }

  public async send<Request extends JsonRequest = JsonRequest>(
    request: Request,
  ): Promise<void> {
    return this.options.outgoing.send(request);
  }
}
