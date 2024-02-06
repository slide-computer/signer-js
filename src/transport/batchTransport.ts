import { JsonRequest, JsonResponse, Transport } from "./types";

export interface BatchTransportOptions {
  transport: Transport;
}

export class BatchTransport implements Transport {
  private queue: JsonRequest[] = [];

  constructor(private options: BatchTransportOptions) {}

  public async registerListener(
    listener: (responses: JsonResponse[]) => Promise<void>,
  ): Promise<() => void> {
    return this.options.transport.registerListener(listener);
  }

  public async send(requests: JsonRequest[]): Promise<void> {
    this.queue.push(...requests);
  }

  public async execute(): Promise<void> {
    const batch = [...this.queue];
    this.queue = [];
    return this.options.transport.send(batch);
  }
}
