import { JsonRequest, JsonResponse, JsonRPC, Transport } from "./types";

export interface PromiseTransportOptions {
  call: (data: JsonRPC) => Promise<JsonRPC | void>;
}

type Listener = (data: JsonRPC) => Promise<void>;

export class PromiseTransport implements Transport {
  private listeners: Listener[] = [];

  constructor(private options: PromiseTransportOptions) {}

  public async registerListener(
    listener: (response: JsonResponse) => Promise<void>,
  ): Promise<() => void> {
    this.listeners.push(listener as Listener);
    return () => {
      this.listeners.splice(this.listeners.indexOf(listener as Listener), 1);
    };
  }

  public async send(request: JsonRequest): Promise<void> {
    const response = await this.options.call(request);
    if (!response) {
      return;
    }
    await Promise.all(this.listeners.map((listener) => listener(response)));
  }
}
