import type { JsonRequest, JsonResponse, Transport } from "./types";
import { isJsonRpcResponse } from "./utils";

export interface PostMessageTransportOptions {
  /** Get window to send and receive messages from */
  getWindow: () => Window;
  /** Get random uuid implementation for status messages */
  crypto?: Pick<Crypto, "randomUUID">;
  /** Polling rate */
  statusPollingRate?: number;
}

export class PostMessageTransport implements Transport {
  private signerWindow?: Window;
  private waitTillReady?: Promise<void>;
  private readyListener?: () => void;

  constructor(private options: PostMessageTransportOptions) {}

  private get crypto() {
    return this.options.crypto ?? globalThis.crypto;
  }

  public registerListener(
    listener: (response: JsonResponse) => Promise<void>,
  ): () => void {
    const messageListener = async (event: MessageEvent) => {
      if (
        !this.signerWindow ||
        event.source !== this.signerWindow ||
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
    const signerWindow = this.options.getWindow();
    if (signerWindow !== this.signerWindow) {
      this.signerWindow = signerWindow;
      this.readyListener?.();
      this.readyListener = this.registerReadyListener();
    }
    await this.waitTillReady;
    this.signerWindow.postMessage(request, "*");
  }

  private registerReadyListener() {
    let interval: number;
    let listener: () => void;
    const id = this.crypto.randomUUID();
    const cleanup = () => {
      clearInterval(interval);
      listener();
    };
    this.waitTillReady = new Promise((resolve) => {
      interval = setInterval(() => {
        this.signerWindow?.postMessage(
          { jsonrpc: "2.0", id, method: "icrc29_status" },
          "*",
        );
      }, this.options.statusPollingRate ?? 200);
      listener = this.registerListener(async (response) => {
        if (
          response.id !== id ||
          !("result" in response) ||
          response.result !== "ready"
        ) {
          return;
        }
        cleanup();
        resolve();
      });
    });
    return cleanup;
  }
}
