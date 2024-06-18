import {
  type Channel,
  isJsonRpcResponse,
  type Transport,
} from "@slide-computer/signer";
import { PostMessageChannel } from "./postMessageChannel";

export class PostMessageTransportError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, PostMessageTransport.prototype);
  }
}

export interface PostMessageTransportOptions {
  /**
   * Open window to send and receive messages from
   */
  openWindow: () => Window;
  /**
   * Relying party window, used to listen for incoming message events
   * @default globalThis.window
   */
  window?: Window;
  /**
   * Get random uuid implementation for status messages
   * @default globalThis.crypto
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
  #options: Required<PostMessageTransportOptions>;

  constructor(options: PostMessageTransportOptions) {
    this.#options = {
      window: globalThis.window,
      crypto: globalThis.crypto,
      statusPollingRate: 200,
      statusTimeout: 5000,
      ...options,
    };
  }

  async establishChannel(): Promise<Channel> {
    return new Promise<Channel>((resolve, reject) => {
      // Signer window
      const signerWindow = this.#options.openWindow();

      // Status message id
      const id = this.#options.crypto.randomUUID();

      // Listen for "status: ready" message
      const listener = (event: MessageEvent) => {
        if (
          event.source !== signerWindow ||
          !isJsonRpcResponse(event.data) ||
          event.data.id !== id ||
          !("result" in event.data) ||
          event.data.result !== "ready"
        ) {
          return;
        }
        const signerOrigin = event.origin;
        clearInterval(interval);
        clearTimeout(timeout);
        window.removeEventListener("message", listener);
        resolve(new PostMessageChannel({ signerWindow, signerOrigin }));
      };
      window.addEventListener("message", listener);

      // Poll status
      const interval = setInterval(() => {
        signerWindow.postMessage(
          { jsonrpc: "2.0", id, method: "icrc29_status" },
          "*",
        );
      }, this.#options.statusPollingRate);

      // Throw error on timeout
      const timeout = setTimeout(() => {
        clearInterval(interval);
        window.removeEventListener("message", listener);
        reject(
          new PostMessageTransportError(
            "Establish communication channel timeout",
          ),
        );
      }, this.#options.statusTimeout);
    });
  }
}
