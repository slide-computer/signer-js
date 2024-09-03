import {
  type Channel,
  isJsonRpcResponse,
  type Transport,
} from "@slide-computer/signer";
import { PostMessageChannel } from "./postMessageChannel";
import { validateURL } from "../utils";

export class PostMessageTransportError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, PostMessageTransportError.prototype);
  }
}

export interface PostMessageTransportOptions {
  /**
   * Signer RPC url to send and receive messages from
   */
  url: string;
  /**
   * Signer window feature config string
   * @example "toolbar=0,location=0,menubar=0,width=500,height=500,left=100,top=100"
   */
  windowOpenerFeatures?: string;
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
  /**
   * Window close monitoring interval in ms
   * @default 500
   */
  windowCloseMonitoringInterval?: number;
  /**
   * Manage focus between relying party and signer window
   * @default true
   */
  manageFocus?: boolean;
}

export class PostMessageTransport implements Transport {
  #options: Required<PostMessageTransportOptions>;

  constructor(options: PostMessageTransportOptions) {
    if (!validateURL(options.url)) {
      throw new PostMessageTransportError("Invalid signer RPC url");
    }

    this.#options = {
      windowOpenerFeatures: options.windowOpenerFeatures ?? "",
      window: globalThis.window,
      crypto: globalThis.crypto,
      statusPollingRate: 200,
      statusTimeout: 5000,
      windowCloseMonitoringInterval: 500,
      manageFocus: true,
      ...options,
    };
  }

  async establishChannel(): Promise<Channel> {
    // Signer window
    const signerWindow = globalThis.open(
      this.#options.url,
      "signerWindow",
      this.#options.windowOpenerFeatures,
    );
    if (!signerWindow) {
      throw new PostMessageTransportError(
        "Communication channel could not be established",
      );
    }

    // Status message id
    const id = this.#options.crypto.randomUUID();

    return new Promise<Channel>((resolve, reject) => {
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
        clearInterval(interval);
        clearTimeout(timeout);
        this.#options.window.removeEventListener("message", listener);
        resolve(
          new PostMessageChannel({
            signerWindow,
            signerOrigin: event.origin,
            window: this.#options.window,
            windowCloseMonitoringInterval:
              this.#options.windowCloseMonitoringInterval,
            manageFocus: this.#options.manageFocus,
          }),
        );
      };
      this.#options.window.addEventListener("message", listener);

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
        this.#options.window.removeEventListener("message", listener);
        reject(
          new PostMessageTransportError(
            "Establish communication channel timeout",
          ),
        );
      }, this.#options.statusTimeout);
    });
  }
}
