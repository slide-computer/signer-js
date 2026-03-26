import type { Transport } from '../transport.js';
import { HeartbeatClient } from './heartbeat/client.js';
import { PostMessageChannel } from './postMessageChannel.js';

const NON_CLICK_ESTABLISHMENT_LINK =
	'https://github.com/slide-computer/signer-js/blob/main/packages/signer-web/README.md#channels-must-be-established-in-a-click-handler';

/** Error thrown by {@link PostMessageTransport} for transport-level failures. */
export class PostMessageTransportError extends Error {}

/** Options for creating a {@link PostMessageTransport}. */
export interface PostMessageTransportOptions {
	/** The signer's RPC URL. Must be a secure context (HTTPS, localhost, or 127.0.0.1). */
	url: string;
	/**
	 * Window features string passed to `window.open()`.
	 * @example "toolbar=0,location=0,menubar=0,width=500,height=500,left=100,top=100"
	 */
	windowOpenerFeatures?: string;
	/**
	 * The relying party window, used to listen for incoming `postMessage` events.
	 * @default globalThis.window
	 */
	window?: Window;
	/**
	 * Time in milliseconds to wait for the ICRC-29 heartbeat handshake to complete.
	 * @default 120000
	 */
	establishTimeout?: number;
	/**
	 * Time in milliseconds the channel can remain in "pending" status
	 * before the connection is considered failed.
	 * @default 300000
	 */
	pendingTimeout?: number;
	/**
	 * Time in milliseconds without a heartbeat response after which
	 * the channel is considered disconnected.
	 * @default 2000
	 */
	disconnectTimeout?: number;
	/**
	 * Interval in milliseconds between ICRC-29 heartbeat status polls.
	 * @default 300
	 */
	statusPollingRate?: number;
	/**
	 * Source of random UUIDs for heartbeat request IDs.
	 * @default globalThis.crypto
	 */
	crypto?: Pick<Crypto, 'randomUUID'>;
	/**
	 * Manage focus between the relying party and signer windows.
	 * When true, the signer window is focused on send and the relying
	 * party window is focused on close.
	 * @default true
	 */
	manageFocus?: boolean;
	/**
	 * Close the signer window if the heartbeat handshake times out.
	 * @default true
	 */
	closeOnEstablishTimeout?: boolean;
	/**
	 * Close the signer window if it stays in "pending" status too long.
	 * @default true
	 */
	closeOnPendingTimeout?: boolean;
	/**
	 * Detect and reject attempts to open the signer window outside a
	 * click handler. Browsers like Safari block popups opened without
	 * user interaction.
	 * @default true
	 */
	detectNonClickEstablishment?: boolean;
}

// Tracks whether we're inside a click event handler.
// Capture phase sets true, bubble phase resets to false.
let withinClick = false;
if (globalThis.window) {
	globalThis.window.addEventListener('click', () => (withinClick = true), true);
	globalThis.window.addEventListener('click', () => (withinClick = false));
}

/**
 * ICRC-29 post message transport for communicating with web-based signers.
 *
 * Opens a window to the signer's URL and establishes a communication channel
 * using the ICRC-29 heartbeat protocol (`icrc29_status` polling). Messages
 * are exchanged via `window.postMessage`.
 *
 * @see https://github.com/dfinity/wg-identity-authentication/blob/main/topics/icrc_29_window_post_message_transport.md
 *
 * @example
 * ```ts
 * const transport = new PostMessageTransport({ url: "https://oisy.com/sign" });
 * const signer = new Signer({ transport });
 * ```
 */
export class PostMessageTransport implements Transport {
	readonly #options: Required<PostMessageTransportOptions>;

	constructor(options: PostMessageTransportOptions) {
		const isSecureContext = (() => {
			try {
				const url = new URL(options.url);
				return (
					url.protocol === 'https:' ||
					url.hostname === '127.0.0.1' ||
					url.hostname.split('.').slice(-1)[0] === 'localhost'
				);
			} catch {
				return false;
			}
		})();
		if (!isSecureContext) {
			throw new PostMessageTransportError('Invalid signer RPC url');
		}

		this.#options = {
			windowOpenerFeatures: '',
			window: globalThis.window,
			establishTimeout: 120000,
			pendingTimeout: 300000,
			disconnectTimeout: 2000,
			statusPollingRate: 300,
			crypto: globalThis.crypto,
			manageFocus: true,
			closeOnEstablishTimeout: true,
			closeOnPendingTimeout: true,
			detectNonClickEstablishment: true,
			...options,
		};
	}

	/**
	 * Opens the signer window and establishes a communication channel
	 * via the ICRC-29 heartbeat handshake.
	 *
	 * @throws {PostMessageTransportError} If called outside a click handler
	 *   (when `detectNonClickEstablishment` is enabled), if the window
	 *   cannot be opened, or if the handshake times out.
	 */
	async establishChannel(): Promise<PostMessageChannel> {
		if (this.#options.detectNonClickEstablishment && !withinClick) {
			throw new PostMessageTransportError(
				`Signer window should not be opened outside of click handler, see: ${NON_CLICK_ESTABLISHMENT_LINK}`,
			);
		}
		const signerWindow = this.#options.window.open(
			this.#options.url,
			`${new URL(this.#options.url).origin}-signer-window`,
			this.#options.windowOpenerFeatures,
		);
		if (!signerWindow) {
			throw new PostMessageTransportError('Signer window could not be opened');
		}

		return new Promise<PostMessageChannel>((resolve, reject) => {
			let channel: PostMessageChannel;
			new HeartbeatClient({
				...this.#options,
				signerWindow,
				onEstablish: (origin, status) => {
					channel = new PostMessageChannel({
						...this.#options,
						signerOrigin: origin,
						signerWindow: signerWindow,
						signerStatus: status,
					});
					resolve(channel);
				},
				onEstablishTimeout: () => {
					if (this.#options.closeOnEstablishTimeout) {
						signerWindow.close();
					}
					reject(
						new PostMessageTransportError(
							'Communication channel could not be established within a reasonable time',
						),
					);
				},
				onPendingTimeout: () => {
					if (this.#options.closeOnPendingTimeout) {
						signerWindow.close();
					}
					reject(new PostMessageTransportError('Communication channel was pending for too long'));
				},
				onDisconnect: () => channel.close(),
				onStatusChange: (status) => channel.changeStatus(status),
			});
		});
	}
}
