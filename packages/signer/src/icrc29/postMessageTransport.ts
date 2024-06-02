import {
  isJsonRpcResponse,
  type JsonRequest,
  type JsonResponse,
  type Transport,
} from "../transport";

export class PostMessageTransportError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, PostMessageTransport.prototype);
  }
}

export interface PostMessageTransportOptions {
  /**
   * Get window to send and receive messages from
   */
  getWindow: () => Window;
  /**
   * Get random uuid implementation for status messages
   * @default window.crypto
   */
  crypto?: Pick<Crypto, "randomUUID">;
  /**
   * Status polling rate in ms
   * @default 200
   */
  statusPollingRate?: number;
  /**
   * Status timeout in ms
   * @default 5000
   */
  statusTimeout?: number;
}

export class PostMessageTransport implements Transport {
  private signerWindow?: Window;
  private origin?: Promise<string>;

  constructor(private options: PostMessageTransportOptions) {}

  private get crypto() {
    return this.options.crypto ?? globalThis.crypto;
  }

  public registerListener(
    listener: (response: JsonResponse) => Promise<void>,
  ): () => void {
    const messageListener = async (event: MessageEvent) => {
      const origin = await this.origin?.catch(() => undefined);
      if (
        !this.signerWindow ||
        !origin ||
        event.source !== this.signerWindow ||
        event.origin !== origin ||
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
    const origin = await this.establishCommunicationChannel();
    this.signerWindow?.postMessage(request, origin);
  }

  private establishCommunicationChannel() {
    const signerWindow = this.options.getWindow();
    if (!this.origin || signerWindow !== this.signerWindow) {
      this.signerWindow = signerWindow;
      this.origin = new Promise<string>((resolve, reject) => {
        // Poll status
        const id = this.crypto.randomUUID();
        const interval = setInterval(() => {
          signerWindow.postMessage(
            { jsonrpc: "2.0", id, method: "icrc29_status" },
            "*",
          );
        }, this.options.statusPollingRate ?? 200);

        // Throw error on timeout
        const timeout = setTimeout(() => {
          clearInterval(interval);
          reject(
            new PostMessageTransportError(
              "Establish communication channel timeout",
            ),
          );
        }, this.options.statusTimeout ?? 5000);

        // Listen for "status: ready" message
        window.addEventListener("message", (event) => {
          if (
            event.source !== signerWindow ||
            !isJsonRpcResponse(event.data) ||
            event.data.id !== id ||
            !("result" in event.data) ||
            event.data.result !== "ready"
          ) {
            return;
          }
          clearInterval(interval);
          clearTimeout(timeout);
          resolve(event.origin);
        });
      });
    }
    return this.origin;
  }
}
