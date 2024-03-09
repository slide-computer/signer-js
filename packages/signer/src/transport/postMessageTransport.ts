import { JsonRequest, JsonResponse, Transport } from "./types";
import { isJsonRpcRequest, isJsonRpcResponse } from "./utils";

export interface PostMessageTransportOptions {
  /** Expected origin of incoming messages and target origin of outgoing messages */
  origin: string;
  /** Get window to send outgoing messages towards */
  getWindow: () => Window;
}

export class PostMessageTransport implements Transport {
  private window?: Window;
  private waitTillReady?: Promise<void>;
  private readyListener?: () => void;

  constructor(private options: PostMessageTransportOptions) {
    this.readyListener = this.registerReadyListener();
  }

  public registerListener(
    listener: (response: JsonResponse) => Promise<void>,
  ): () => void {
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
    if (this.window?.closed) {
      this.readyListener?.();
      this.readyListener = this.registerReadyListener();
    }
    this.window = this.options.getWindow();
    await this.waitTillReady;
    this.window.postMessage(request, this.options.origin);
  }

  private registerReadyListener() {
    let listener: (event: MessageEvent) => void;
    this.waitTillReady = new Promise((resolve) => {
      listener = (event: MessageEvent) => {
        if (
          event.origin !== this.options.origin ||
          !isJsonRpcRequest(event.data) ||
          event.data.method !== "icrc29_ready"
        ) {
          return;
        }
        window.removeEventListener("message", listener);
        resolve();
      };
      window.addEventListener("message", listener);
    });
    return () => window.removeEventListener("message", listener);
  }
}
