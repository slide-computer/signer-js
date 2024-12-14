import { isJsonRpcResponse, type Transport } from "@slide-computer/signer";
import { PostMessageChannel } from "./postMessageChannel";
import { urlIsSecureContext } from "../utils";

const NON_CLICK_ESTABLISHMENT_LINK =
  "https://github.com/slide-computer/signer-js/blob/main/packages/signer-web/README.md#channels-must-be-established-in-a-click-handler";

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
   * Reasonable time in milliseconds in which the communication channel needs to be established
   * @default 10000
   */
  establishTimeout?: number;
  /**
   * Time in milliseconds of not receiving heartbeat responses after which the communication channel is disconnected
   * @default 2000
   */
  disconnectTimeout?: number;
  /**
   * Status polling rate in ms
   * @default 300
   */
  statusPollingRate?: number;
  /**
   * Get random uuid implementation for status messages
   * @default globalThis.crypto
   */
  crypto?: Pick<Crypto, "randomUUID">;
  /**
   * Manage focus between relying party and signer window
   * @default true
   */
  manageFocus?: boolean;
  /**
   * Close signer window on communication channel establish timeout
   * @default true
   */
  closeOnEstablishTimeout?: boolean;
  /**
   * Detect attempts to establish channel outside of click handler
   * @default true
   */
  detectNonClickEstablishment?: boolean;
}

export class PostMessageTransport implements Transport {
  readonly #options: Required<PostMessageTransportOptions>;
  #withinClick = false;

  constructor(options: PostMessageTransportOptions) {
    if (!urlIsSecureContext(options.url)) {
      throw new PostMessageTransportError("Invalid signer RPC url");
    }

    this.#options = {
      windowOpenerFeatures: "",
      window: globalThis.window,
      establishTimeout: 10000,
      disconnectTimeout: 2000,
      statusPollingRate: 300,
      crypto: globalThis.crypto,
      manageFocus: true,
      closeOnEstablishTimeout: true,
      detectNonClickEstablishment: true,
      ...options,
    };

    if (this.#options.detectNonClickEstablishment) {
      window.addEventListener("click", () => (this.#withinClick = true), true);
      window.addEventListener("click", () => (this.#withinClick = false));
    }
  }

  async establishChannel(): Promise<PostMessageChannel> {
    return new Promise<PostMessageChannel>((resolve, reject) => {
      let channel: PostMessageChannel;
      let heartbeatInterval: ReturnType<typeof setInterval>;
      let disconnectTimeout: ReturnType<typeof setTimeout>;

      // Open signer window
      if (this.#options.detectNonClickEstablishment && !this.#withinClick) {
        reject(
          new PostMessageTransportError(
            `Signer window should not be opened outside of click handler, see: ${NON_CLICK_ESTABLISHMENT_LINK}`,
          ),
        );
        return;
      }
      const signerWindow = this.#options.window.open(
        this.#options.url,
        "signerWindow",
        this.#options.windowOpenerFeatures,
      );
      if (!signerWindow) {
        reject(
          new PostMessageTransportError("Signer window could not be opened"),
        );
        return;
      }

      // Establishing the communication channel needs to happen within a reasonable time
      const establishTimeout = setTimeout(() => {
        if (channel) {
          return;
        }
        clearInterval(heartbeatInterval);
        if (this.#options.closeOnEstablishTimeout) {
          signerWindow.close();
        }
        reject(
          new PostMessageTransportError(
            "Communication channel could not be established within a reasonable time",
          ),
        );
      }, this.#options.establishTimeout);

      heartbeatInterval = setInterval(() => {
        const id = crypto.randomUUID();
        const listener = async (event: MessageEvent) => {
          if (
            event.source !== signerWindow ||
            !isJsonRpcResponse(event.data) ||
            event.data.id !== id ||
            !("result" in event.data) ||
            event.data.result !== "ready"
          ) {
            return;
          }
          this.#options.window.removeEventListener("message", listener);

          // Communication channel is established when first ready message is received
          if (!channel) {
            channel = new PostMessageChannel({
              ...this.#options,
              signerOrigin: event.origin,
              signerWindow: signerWindow,
            });
            clearTimeout(establishTimeout);
            resolve(channel);
            return;
          }

          // Communication channel has disconnected if no ready message has been received for a while
          clearTimeout(disconnectTimeout);
          disconnectTimeout = setTimeout(() => {
            clearInterval(heartbeatInterval);
            channel.close();
          }, this.#options.disconnectTimeout);
        };

        this.#options.window.addEventListener("message", listener);
        signerWindow.postMessage(
          { jsonrpc: "2.0", id, method: "icrc29_status" },
          "*",
        );
      }, this.#options.statusPollingRate);
    });
  }
}
