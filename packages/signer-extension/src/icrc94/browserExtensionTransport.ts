import { type Transport } from "@slide-computer/signer";
import {
  BrowserExtensionChannel,
  type BrowserExtensionChannelOptions,
} from "./browserExtensionChannel";
import type { ProviderDetail } from "./types";

export class BrowserExtensionTransportError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, BrowserExtensionTransportError.prototype);
  }
}

export interface BrowserExtensionTransportOptions
  extends BrowserExtensionChannelOptions {}

export interface DiscoverBrowserExtensionOptions {
  /**
   * Time in milliseconds to wait for all browser extensions to send an icrc94:announceProvider event
   * @default 100
   */
  discoveryDuration?: number;
  /**
   * Relying party window, used to listen for incoming events
   * @default globalThis.window
   */
  window?: Window;
}

export interface EstablishBrowserExtensionTransportOptions
  extends DiscoverBrowserExtensionOptions,
    Omit<BrowserExtensionTransportOptions, "providerDetail"> {
  uuid: string;
}

export class BrowserExtensionTransport implements Transport {
  readonly #options: Required<BrowserExtensionTransportOptions>;

  constructor(options: BrowserExtensionTransportOptions) {
    this.#options = {
      window: globalThis.window,
      ...options,
    };
  }

  static async discover({
    discoveryDuration = 100,
    window = globalThis.window,
  }: DiscoverBrowserExtensionOptions): Promise<ProviderDetail[]> {
    const providerDetails: ProviderDetail[] = [];
    window.addEventListener("icrc94:announceProvider", (event) =>
      providerDetails.push(event.detail),
    );
    window.dispatchEvent(new CustomEvent("icrc94:requestProvider"));
    await new Promise((resolve) => setTimeout(resolve, discoveryDuration));
    return providerDetails;
  }

  static async findTransport(
    options: EstablishBrowserExtensionTransportOptions,
  ): Promise<BrowserExtensionTransport> {
    const providerDetails = await BrowserExtensionTransport.discover(options);
    const providerDetail = providerDetails.find(
      ({ uuid }) => uuid === options.uuid,
    );
    if (!providerDetail) {
      throw new BrowserExtensionTransportError(
        "Browser extension couldn't be found, make sure it's installed and enabled for this page.",
      );
    }
    return new BrowserExtensionTransport({ ...options, providerDetail });
  }

  async establishChannel(): Promise<BrowserExtensionChannel> {
    return new BrowserExtensionChannel(this.#options);
  }
}
