import {
  type Channel,
  isJsonRpcResponse,
  type JsonRequest,
  type JsonResponse,
} from "@slide-computer/signer";
import { PostMessageTransportError } from "./postMessageTransport";

export interface PostMessageChannelOptions {
  /**
   * Signer window with which a communication channel has been established
   */
  window: Window;
  /**
   * Signer origin obtained when communication channel was established
   */
  origin: string;
  /**
   * Window close monitoring interval in ms
   * @default 500
   */
  windowCloseMonitoringInterval?: number;
}

export class PostMessageChannel implements Channel {
  #closeListeners = new Set<() => void>();
  #options: PostMessageChannelOptions;

  constructor(options: PostMessageChannelOptions) {
    this.#options = options;

    const interval = setInterval(() => {
      if (this.#options.window.closed) {
        this.#closeListeners.forEach((listener) => listener());
        clearInterval(interval);
      }
    }, this.#options.windowCloseMonitoringInterval ?? 500);
  }

  get closed() {
    return this.#options.window.closed;
  }

  addEventListener(
    ...[event, listener]:
      | [event: "close", listener: () => void]
      | [event: "response", listener: (response: JsonResponse) => void]
  ): () => void {
    switch (event) {
      case "close":
        this.#closeListeners.add(listener);
        return () => {
          this.#closeListeners.delete(listener);
        };
      case "response":
        const messageListener = async (event: MessageEvent) => {
          if (
            event.source !== this.#options.window ||
            event.origin !== this.#options.origin ||
            !isJsonRpcResponse(event.data)
          ) {
            return;
          }
          listener(event.data);
        };
        window.addEventListener("message", messageListener);
        return () => {
          window.removeEventListener("message", messageListener);
        };
    }
  }

  async send(request: JsonRequest): Promise<void> {
    if (this.#options.window.closed) {
      throw new PostMessageTransportError("Communication channel is closed");
    }
    this.#options.window.postMessage(request, this.#options.origin);
  }

  async close(): Promise<void> {
    this.#options.window.close();
  }
}
