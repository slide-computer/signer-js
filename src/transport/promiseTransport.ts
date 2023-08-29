import { JsonRequest, JsonResponse, Transport } from "../types";

export interface PromiseTransportOptions {
  call: (request: JsonRequest) => Promise<JsonResponse | void>;
}

type Listener = (response: JsonResponse) => Promise<void>;

export class PromiseTransport implements Transport {
  private listeners: Listener[] = [];

  constructor(private options: PromiseTransportOptions) {}

  public async registerListener<Response extends JsonResponse = JsonResponse>(
    listener: (response: Response) => Promise<void>,
  ): Promise<() => void> {
    this.listeners.push(listener as Listener);
    return () => {
      this.listeners.splice(this.listeners.indexOf(listener as Listener), 1);
    };
  }

  public async send<Request extends JsonRequest = JsonRequest>(
    request: Request,
  ): Promise<void> {
    const response = await this.options.call(request);
    if (!response) {
      return;
    }
    await Promise.all(this.listeners.map((listener) => listener(response)));
  }
}
