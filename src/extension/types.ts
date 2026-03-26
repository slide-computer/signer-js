import type { JsonRpcRequest } from '../transport.js';

/**
 * Details about a browser extension signer, as announced via the
 * ICRC-94 `icrc94:announceProvider` event.
 *
 * @see https://github.com/dfinity/wg-identity-authentication/blob/main/topics/icrc_94_multi_injected_provider_discovery.md
 */
export interface ProviderDetail {
	/** Globally unique identifier (UUIDv4) for this extension. */
	uuid: string;
	/** Human-readable name of the signer. */
	name: string;
	/** Icon as a data URI (e.g. `data:image/svg+xml,...`). */
	icon: `data:image/${string}`;
	/** Reverse domain name identifier (e.g. `com.example.wallet`). */
	rdns: string;
	/** Sends a JSON-RPC request to the extension and returns the response. */
	sendMessage: (message: JsonRpcRequest) => Promise<unknown>;
	/** Dismisses the extension's UI. */
	dismiss: () => Promise<void>;
}

/** Fired by extensions to announce their presence. */
export interface AnnounceProviderEvent extends CustomEvent<ProviderDetail> {
	type: 'icrc94:announceProvider';
}

/** Dispatched by relying parties to trigger extension announcements. */
export interface RequestProviderEvent extends Event {
	type: 'icrc94:requestProvider';
}

/** Fired by extensions when they close unexpectedly. */
export interface UnexpectedlyClosedEvent extends Event {
	type: 'icrc94:unexpectedlyClosed';
}
