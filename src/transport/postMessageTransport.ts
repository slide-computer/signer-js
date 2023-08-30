import { JsonRequest, JsonResponse, Transport } from "../types";

export interface PostMessageTransportOptions {
  /** Expected origin of incoming messages and target origin of outgoing messages */
  origin: string;
  /** Retrieve window to send outgoing messages to */
  getWindow?: () => Window;
}

export class PostMessageTransport implements Transport {
  constructor(private options: PostMessageTransportOptions) {}

  public async registerListener<Response extends JsonResponse = JsonResponse>(
    listener: (response: Response) => Promise<void>,
  ): Promise<() => void> {
    const messageListener = async (event: MessageEvent) => {
      if (
        event.origin !== this.options.origin ||
        typeof event.data !== "object" ||
        !event.data ||
        !("jsonrpc" in event.data) ||
        event.data.jsonrpc !== "2.0"
      ) {
        return;
      }
      await listener(event.data);
    };
    window.addEventListener("message", messageListener);
    return () => {
      window.removeEventListener("message", messageListener);
    };
  }

  public async send<Request extends JsonRequest = JsonRequest>(
    request: Request,
  ): Promise<void> {
    this.options.getWindow?.().postMessage(request, this.options.origin);
  }
}
