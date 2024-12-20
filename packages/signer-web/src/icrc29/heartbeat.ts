import { isJsonRpcResponse, type JsonResponse } from "@slide-computer/signer";

export interface HeartbeatOptions {
  /**
   * Signer window to send and receive heartbeat messages from
   */
  signerWindow: Window;
  /**
   * Callback when first heartbeat has been received
   */
  onEstablish: (origin: string) => void;
  /**
   * Reasonable time in milliseconds in which the communication channel needs to be established
   * @default 10000
   */
  establishTimeout?: number;
  /**
   * Callback when no heartbeats have been received for {@link establishTimeout} milliseconds
   */
  onEstablishTimeout: () => void;
  /**
   * Time in milliseconds of not receiving heartbeat responses after which the communication channel is disconnected
   * @default 2000
   */
  disconnectTimeout?: number;
  /**
   * Callback when no heartbeats have been received for {@link disconnectTimeout} milliseconds
   */
  onDisconnect: () => void;
  /**
   * Status polling rate in ms
   * @default 300
   */
  statusPollingRate?: number;
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
}

export class Heartbeat {
  readonly #options: Required<HeartbeatOptions>;

  constructor(options: HeartbeatOptions) {
    this.#options = {
      establishTimeout: 10000,
      disconnectTimeout: 2000,
      statusPollingRate: 300,
      window: globalThis.window,
      crypto: globalThis.crypto,
      ...options,
    };

    this.#establish();
  }

  #establish(): void {
    const timeout = setTimeout(() => {
      listener();
      clearInterval(interval);

      this.#options.onEstablishTimeout();
    }, this.#options.establishTimeout);

    const listener = this.#receiveReadyResponse((response) => {
      listener();
      clearInterval(interval);
      clearTimeout(timeout);

      this.#options.onEstablish(response.origin);
      this.#maintain(response.origin);
    });

    const interval = setInterval(
      () => this.#sendStatusMessage(this.#options.crypto.randomUUID()),
      this.#options.statusPollingRate,
    );
  }

  #maintain(origin: string): void {
    let timeout: ReturnType<typeof setTimeout>;
    let id: string;

    const listener = this.#receiveReadyResponse((response) => {
      if (id && response.data.id === id && response.origin === origin) {
        clearTimeout(timeout);
        setTimeout(poll, this.#options.statusPollingRate);
      }
    });

    const poll = () => {
      id = this.#options.crypto.randomUUID();
      timeout = setTimeout(() => {
        listener();
        this.#options.onDisconnect();
      }, this.#options.disconnectTimeout);

      this.#sendStatusMessage(id);
    };

    setTimeout(poll, this.#options.statusPollingRate);
  }

  #receiveReadyResponse(
    handler: (event: MessageEvent<JsonResponse<"ready">>) => void,
  ): () => void {
    const listener = (event: MessageEvent) => {
      if (
        event.source === this.#options.signerWindow &&
        isJsonRpcResponse(event.data) &&
        "result" in event.data &&
        event.data.result === "ready"
      ) {
        handler(event);
      }
    };
    this.#options.window.addEventListener("message", listener);
    return () => this.#options.window.removeEventListener("message", listener);
  }

  #sendStatusMessage(id: string): void {
    this.#options.signerWindow.postMessage(
      { jsonrpc: "2.0", id, method: "icrc29_status" },
      "*",
    );
  }
}
