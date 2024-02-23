import { JsonRequest, JsonResponse, Transport } from "./types";
import { isJsonRpcRequest, isJsonRpcResponse } from "./utils";

export interface PostMessageTransportOptions {
  /** Expected origin of incoming messages and target origin of outgoing messages */
  origin: string;
  /** Get window to send outgoing messages towards */
  getWindow: () => Window;
}

export class PostMessageTransport implements Transport {
  private readonly waitTillReady: Promise<void>;

  constructor(private options: PostMessageTransportOptions) {
    this.waitTillReady = new Promise((resolve) => {
      window.addEventListener("message", (event: MessageEvent) => {
        if (
          event.origin !== this.options.origin ||
          !isJsonRpcRequest(event.data) ||
          event.data.method !== "icrc29_ready"
        ) {
          return;
        }
        resolve();
      });
    });
  }

  public async registerListener(
    listener: (response: JsonResponse) => Promise<void>,
  ): Promise<() => void> {
    const messageListener = async (event: MessageEvent) => {
      if (
        event.origin !== this.options.origin ||
        !isJsonRpcResponse(event.data)
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

  public async send(request: JsonRequest): Promise<void> {
    const window = this.options.getWindow();
    await this.waitTillReady;
    window?.postMessage(request, this.options.origin);
  }
}
