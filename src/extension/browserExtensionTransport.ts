import type { Transport } from '../transport.js';
import {
	BrowserExtensionChannel,
	type BrowserExtensionChannelOptions,
} from './browserExtensionChannel.js';
import type { ProviderDetail } from './types.js';

/** Error thrown by {@link BrowserExtensionTransport} for transport-level failures. */
export class BrowserExtensionTransportError extends Error {}

/** Options for creating a {@link BrowserExtensionTransport}. */
export interface BrowserExtensionTransportOptions extends BrowserExtensionChannelOptions {}

/** Options for {@link BrowserExtensionTransport.discover}. */
export interface DiscoverBrowserExtensionOptions {
	/**
	 * Time in milliseconds to wait for browser extensions to announce themselves
	 * via `icrc94:announceProvider` events.
	 * @default 100
	 */
	discoveryDuration?: number;
	/**
	 * The window to listen for extension events on.
	 * @default globalThis.window
	 */
	window?: Window;
}

/** Options for {@link BrowserExtensionTransport.findTransport}. */
export interface EstablishBrowserExtensionTransportOptions
	extends DiscoverBrowserExtensionOptions,
		Omit<BrowserExtensionTransportOptions, 'providerDetail'> {
	/** The UUID of the browser extension to connect to. */
	uuid: string;
}

/**
 * ICRC-94 transport for communicating with browser extension signers.
 *
 * Browser extensions announce themselves via `icrc94:announceProvider`
 * window events. Use {@link discover} to find installed extensions, or
 * {@link findTransport} to connect to a specific one by UUID.
 *
 * @see https://github.com/dfinity/wg-identity-authentication/blob/main/topics/icrc_94_multi_injected_provider_discovery.md
 *
 * @example
 * ```ts
 * // Discover all installed extensions
 * const providers = await BrowserExtensionTransport.discover();
 *
 * // Or connect to a specific extension by UUID
 * const transport = await BrowserExtensionTransport.findTransport({ uuid: "..." });
 * const signer = new Signer({ transport });
 * ```
 */
export class BrowserExtensionTransport implements Transport {
	readonly #options: Required<BrowserExtensionTransportOptions>;

	constructor(options: BrowserExtensionTransportOptions) {
		this.#options = {
			window: globalThis.window,
			...options,
		};
	}

	/**
	 * Discovers all installed browser extension signers by dispatching
	 * an `icrc94:requestProvider` event and collecting `icrc94:announceProvider`
	 * responses. Waits for `discoveryDuration` ms before returning.
	 *
	 * @returns The discovered extension providers, deduplicated by UUID.
	 */
	static async discover({
		discoveryDuration = 100,
		window = globalThis.window,
	}: DiscoverBrowserExtensionOptions = {}): Promise<ProviderDetail[]> {
		const providerDetails: ProviderDetail[] = [];
		window.addEventListener('icrc94:announceProvider', ((event: CustomEvent<ProviderDetail>) => {
			if (providerDetails.find((providerDetail) => providerDetail.uuid === event.detail.uuid)) {
				return;
			}
			providerDetails.push(event.detail);
		}) as EventListener);
		window.dispatchEvent(new CustomEvent('icrc94:requestProvider'));
		await new Promise((resolve) => setTimeout(resolve, discoveryDuration));
		return providerDetails;
	}

	/**
	 * Discovers extensions and connects to the one matching the given UUID.
	 *
	 * @throws {BrowserExtensionTransportError} If no extension with the given
	 *   UUID is found.
	 */
	static async findTransport(
		options: EstablishBrowserExtensionTransportOptions,
	): Promise<BrowserExtensionTransport> {
		const providerDetails = await BrowserExtensionTransport.discover(options);
		const providerDetail = providerDetails.find(({ uuid }) => uuid === options.uuid);
		if (!providerDetail) {
			throw new BrowserExtensionTransportError(
				"Browser extension couldn't be found, make sure it's installed and enabled for this page.",
			);
		}
		return new BrowserExtensionTransport({ ...options, providerDetail });
	}

	/** Creates a new {@link BrowserExtensionChannel} for this extension. */
	async establishChannel(): Promise<BrowserExtensionChannel> {
		return new BrowserExtensionChannel(this.#options);
	}
}
