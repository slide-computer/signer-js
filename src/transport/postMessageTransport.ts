import { JsonRequest, JsonResponse, Transport } from "./types";

export interface PostMessageTransportOptions {
  /** Expected origin of incoming messages and target origin of outgoing messages */
  origin: string;
  /** Retrieve window to send outgoing messages to */
  getWindow?: () => Window;
}

export class PostMessageTransport implements Transport {
  constructor(private options: PostMessageTransportOptions) {}

  public async registerListener(
    listener: (responses: JsonResponse[]) => Promise<void>,
  ): Promise<() => void> {
    const messageListener = async (event: MessageEvent) => {
      if (
        event.origin !== this.options.origin ||
        !Array.isArray(event.data) ||
        event.data.some(
          (response) =>
            typeof response !== "object" ||
            !response ||
            !("jsonrpc" in response) ||
            response.jsonrpc !== "2.0",
        )
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

  public async send(requests: JsonRequest[]): Promise<void> {
    this.options.getWindow?.().postMessage(requests, this.options.origin);
  }
}
