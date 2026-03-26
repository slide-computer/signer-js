import {
	type Channel,
	isJsonRpcResponse,
	type JsonRpcRequest,
	type JsonRpcResponse,
} from '../transport.js';
import { BrowserExtensionTransportError } from './browserExtensionTransport.js';
import type { ProviderDetail } from './types.js';

/** Options for creating a {@link BrowserExtensionChannel}. */
export interface BrowserExtensionChannelOptions {
	/** The provider details obtained during extension discovery. */
	providerDetail: ProviderDetail;
	/**
	 * The window to listen for extension events on.
	 * @default globalThis.window
	 */
	window?: Window;
}

/**
 * A {@link Channel} implementation that communicates with a browser
 * extension signer via the ICRC-94 provider API.
 *
 * Messages are sent through `providerDetail.sendMessage` and responses
 * are validated as JSON-RPC before being dispatched to listeners.
 * The channel is automatically closed if the extension fires an
 * `icrc94:unexpectedlyClosed` event.
 */
export class BrowserExtensionChannel implements Channel {
	readonly #closeListeners = new Set<() => void>();
	readonly #responseListeners = new Set<(response: JsonRpcResponse) => void>();
	readonly #options: Required<BrowserExtensionChannelOptions>;
	#closed = false;

	constructor(options: BrowserExtensionChannelOptions) {
		this.#options = {
			window: globalThis.window,
			...options,
		};

		// Listen for unexpected extension closure
		const closeListener = () => {
			this.#options.window.removeEventListener('icrc94:unexpectedlyClosed', closeListener);
			this.#closed = true;
			for (const listener of this.#closeListeners) listener();
		};
		this.#options.window.addEventListener('icrc94:unexpectedlyClosed', closeListener);
	}

	/** Whether this channel has been closed. */
	get closed() {
		return this.#closed;
	}

	addEventListener(
		...[event, listener]:
			| [event: 'close', listener: () => void]
			| [event: 'response', listener: (response: JsonRpcResponse) => void]
	): () => void {
		switch (event) {
			case 'close':
				this.#closeListeners.add(listener);
				return () => {
					this.#closeListeners.delete(listener);
				};
			case 'response':
				this.#responseListeners.add(listener);
				return () => {
					this.#responseListeners.delete(listener);
				};
		}
	}

	/**
	 * Sends a JSON-RPC request to the extension via `providerDetail.sendMessage`.
	 * The response is validated as JSON-RPC before being dispatched.
	 * Non-JSON-RPC responses are silently ignored.
	 */
	async send(request: JsonRpcRequest): Promise<void> {
		if (this.#closed) {
			throw new BrowserExtensionTransportError('Communication channel is closed');
		}

		const response = await this.#options.providerDetail.sendMessage(request);
		if (!isJsonRpcResponse(response)) {
			return;
		}
		for (const listener of this.#responseListeners) listener(response);
	}

	/** Dismisses the extension and notifies all close listeners. */
	async close(): Promise<void> {
		if (this.#closed) {
			return;
		}
		this.#closed = true;
		await this.#options.providerDetail.dismiss();
		for (const listener of this.#closeListeners) listener();
	}
}
