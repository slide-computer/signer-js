import {
  type Channel,
  isJsonRpcResponse,
  type JsonRequest,
  type JsonResponse,
} from "@slide-computer/signer";
import type { ProviderDetail } from "./types";
import { BrowserExtensionTransportError } from "./browserExtensionTransport";

export interface BrowserExtensionChannelOptions {
  /**
   * Provider details received during browser extension discovery
   */
  providerDetail: ProviderDetail;
  /**
   * Relying party window, used to listen for incoming events
   * @default globalThis.window
   */
  window?: Window;
}

export class BrowserExtensionChannel implements Channel {
  readonly #closeListeners = new Set<() => void>();
  readonly #responseListeners = new Set<(response: JsonResponse) => void>();
  readonly #options: Required<BrowserExtensionChannelOptions>;
  #closed = false;

  constructor(options: BrowserExtensionChannelOptions) {
    this.#options = {
      window: globalThis.window,
      ...options,
    };

    const closeListener = () => {
      this.#options.window.removeEventListener(
        "icrc94:unexpectedlyClosed",
        closeListener,
      );
      this.#closed = true;
      this.#closeListeners.forEach((listener) => listener());
    };
    this.#options.window.addEventListener(
      "icrc94:unexpectedlyClosed",
      closeListener,
    );
  }

  get closed() {
    return this.#closed;
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
        this.#responseListeners.add(listener);
        return () => {
          this.#responseListeners.delete(listener);
        };
    }
  }

  async send(request: JsonRequest): Promise<void> {
    if (this.#closed) {
      throw new BrowserExtensionTransportError(
        "Communication channel is closed",
      );
    }

    const response = await this.#options.providerDetail.sendMessage(request);
    if (!isJsonRpcResponse(response)) {
      return;
    }
    this.#responseListeners.forEach((listener) => listener(response));
  }

  async close(): Promise<void> {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    await this.#options.providerDetail.dismiss();
    this.#closeListeners.forEach((listener) => listener());
  }
}
