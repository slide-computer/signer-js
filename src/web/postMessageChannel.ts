import {
	type Channel,
	type JsonRpcRequest,
	type JsonRpcResponse,
	isJsonRpcResponse,
} from '../transport.js';
import { PostMessageTransportError } from './postMessageTransport.js';

/** Options for creating a {@link PostMessageChannel}. */
export interface PostMessageChannelOptions {
	/** The signer window that this channel communicates with. */
	signerWindow: Window;
	/** The verified origin of the signer window. */
	signerOrigin: string;
	/**
	 * Initial status of the signer. When `"pending"`, messages are queued
	 * until the status changes to `"ready"`.
	 * @default "ready"
	 */
	signerStatus?: 'pending' | 'ready';
	/**
	 * The relying party window, used to listen for incoming `postMessage` events.
	 * @default globalThis.window
	 */
	window?: Window;
	/**
	 * Manage focus between the relying party and signer windows.
	 * @default true
	 */
	manageFocus?: boolean;
}

/**
 * A {@link Channel} implementation that communicates with a signer
 * via `window.postMessage`. Created by {@link PostMessageTransport}
 * after the ICRC-29 heartbeat handshake completes.
 *
 * Messages are filtered by source window and origin to prevent
 * cross-origin interference. When the signer status is `"pending"`,
 * outgoing messages are queued and flushed when it becomes `"ready"`.
 */
export class PostMessageChannel implements Channel {
	readonly #closeListeners = new Set<() => void>();
	readonly #options: Required<PostMessageChannelOptions>;
	#closed = false;
	#pendingQueue: JsonRpcRequest[] = [];

	constructor(options: PostMessageChannelOptions) {
		this.#options = {
			signerStatus: 'ready',
			window: globalThis.window,
			manageFocus: true,
			...options,
		};
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
			case 'response': {
				const messageListener = async (event: MessageEvent) => {
					// Only accept messages from the signer's window and origin
					if (
						event.source !== this.#options.signerWindow ||
						event.origin !== this.#options.signerOrigin ||
						!isJsonRpcResponse(event.data)
					) {
						return;
					}
					listener(event.data);
				};
				this.#options.window.addEventListener('message', messageListener);
				return () => {
					this.#options.window.removeEventListener('message', messageListener);
				};
			}
		}
	}

	/**
	 * Sends a JSON-RPC request to the signer. If the signer status is
	 * `"pending"`, the request is queued until {@link changeStatus} is
	 * called with `"ready"`.
	 */
	async send(request: JsonRpcRequest): Promise<void> {
		if (this.#closed) {
			throw new PostMessageTransportError('Communication channel is closed');
		}

		if (this.#options.signerStatus === 'pending') {
			this.#pendingQueue.push(request);
			return;
		}

		this.#options.signerWindow.postMessage(request, this.#options.signerOrigin);

		if (this.#options.manageFocus) {
			this.#options.signerWindow.focus();
		}
	}

	/** Closes the signer window and notifies all close listeners. */
	async close(): Promise<void> {
		if (this.#closed) {
			return;
		}

		this.#closed = true;

		this.#options.signerWindow.close();
		if (this.#options.manageFocus) {
			this.#options.window.focus();
		}

		for (const listener of this.#closeListeners) listener();
	}

	/**
	 * Updates the signer status. When transitioning to `"ready"`,
	 * all queued messages are flushed to the signer window.
	 */
	changeStatus(status: 'pending' | 'ready') {
		this.#options.signerStatus = status;

		if (status === 'ready') {
			const requests = this.#pendingQueue;
			this.#pendingQueue = [];
			requests.forEach((request) => {
				this.#options.signerWindow.postMessage(request, this.#options.signerOrigin);
			});
		}
	}
}
