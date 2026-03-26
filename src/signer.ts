import type { PublicKey, Signature } from '@icp-sdk/core/agent';
import { Delegation, DelegationChain } from '@icp-sdk/core/identity';
import { Principal } from '@icp-sdk/core/principal';
import { z } from 'zod';
import {
	type Channel,
	type JsonRpcError,
	JsonRpcErrorSchema,
	type JsonRpcRequest,
	type JsonRpcResponse,
	type Transport,
} from './transport.js';

const GENERIC_ERROR = 1000;
const NETWORK_ERROR = 4000;

/**
 * A permission scope identifies a method and optionally additional
 * constraints (e.g. target canister IDs for delegations).
 *
 * @see https://github.com/dfinity/wg-identity-authentication/blob/main/topics/icrc_25_signer_interaction_standard.md
 */
export type PermissionScope = { method: string } & Record<string, unknown>;

/**
 * The state of a permission scope as reported by the signer.
 * - `granted` — the relying party may call the method without further approval.
 * - `denied` — the signer will reject calls to the method.
 * - `ask_on_use` — the signer will prompt the user when the method is called.
 */
export type PermissionState = 'denied' | 'ask_on_use' | 'granted';

/**
 * A standard supported by the signer, as returned by
 * {@link Signer.getSupportedStandards}. The `name` field contains
 * the ICRC standard identifier (e.g. `"ICRC-27"`) and `url` points
 * to the specification.
 */
export type SupportedStandard = {
	name: string;
	url: string;
};

/**
 * Error thrown when a signer returns a JSON-RPC error response
 * or when a transport-level failure occurs.
 */
export class SignerError extends Error {
	/** The JSON-RPC error code. */
	public code: number;
	/** Optional additional error data from the signer. */
	public data?: JsonRpcError['data'];

	constructor(error: JsonRpcError, options?: ErrorOptions) {
		super(error.message, options);

		this.code = error.code;
		this.data = error.data;
	}
}

// Codecs for bidirectional wire format conversion
const zBase64 = z.codec(z.base64(), z.custom<Uint8Array>(), {
	decode: (s) => z.util.base64ToUint8Array(s),
	encode: (b) => z.util.uint8ArrayToBase64(b),
});

const zPrincipal = z.codec(z.string(), z.custom<Principal>(), {
	decode: (s) => Principal.fromText(s),
	encode: (p) => p.toText(),
});

/** Options for creating a {@link Signer} instance. */
export interface SignerOptions<T extends Transport> {
	/** The transport used to communicate with the signer. */
	transport: T;
	/**
	 * Automatically close the transport channel after a response is received.
	 * @default true
	 */
	autoCloseTransportChannel?: boolean;
	/**
	 * Delay in milliseconds before auto-closing the transport channel.
	 * @default 200
	 */
	closeTransportChannelAfter?: number;
	/**
	 * Source of random UUIDs for JSON-RPC request IDs.
	 * @default globalThis.crypto
	 */
	crypto?: Pick<Crypto, 'randomUUID'>;
	/**
	 * Derivation origin for ICRC-95 identity derivation.
	 * When set, all requests include an `icrc95DerivationOrigin` param.
	 *
	 * @see https://github.com/dfinity/wg-identity-authentication/blob/main/topics/icrc_95_derivationorigin.md
	 */
	derivationOrigin?: string;
}

/**
 * Client for interacting with an ICRC-25 compliant signer.
 *
 * Signers are applications that hold private keys and can sign messages
 * on behalf of a user. They communicate over a {@link Transport} using
 * JSON-RPC 2.0 messages as defined by the ICRC-25 standard.
 *
 * @see https://github.com/dfinity/wg-identity-authentication/blob/main/topics/icrc_25_signer_interaction_standard.md
 *
 * @example
 * ```ts
 * import { Signer } from "@icp-sdk/signer";
 * import { PostMessageTransport } from "@icp-sdk/signer/web";
 *
 * const transport = new PostMessageTransport({ url: "https://oisy.com/sign" });
 * const signer = new Signer({ transport });
 *
 * const standards = await signer.getSupportedStandards();
 * const accounts = await signer.getAccounts();
 * ```
 */
export class Signer<T extends Transport = Transport> {
	readonly #options: Required<Omit<SignerOptions<T>, 'derivationOrigin'>> &
		Pick<SignerOptions<T>, 'derivationOrigin'>;
	#channel?: Channel;
	#establishingChannel?: Promise<void>;
	#scheduledChannelClosure?: ReturnType<typeof setTimeout>;

	constructor(options: SignerOptions<T>) {
		this.#options = {
			autoCloseTransportChannel: true,
			closeTransportChannelAfter: 200,
			crypto: globalThis.crypto,
			...options,
		};
	}

	/** The transport used to communicate with the signer. */
	get transport(): T {
		return this.#options.transport;
	}

	/**
	 * Opens a communication channel with the signer.
	 * Reuses an existing open channel if available.
	 */
	async openChannel(): Promise<Channel> {
		clearTimeout(this.#scheduledChannelClosure);

		if (this.#establishingChannel) {
			await this.#establishingChannel;
		}

		if (this.#channel && !this.#channel.closed) {
			return this.#channel;
		}

		const channel = this.#options.transport.establishChannel();
		this.#establishingChannel = channel.then(() => {}).catch(() => {});
		this.#channel = undefined;
		this.#channel = await channel.catch((error) => {
			throw new SignerError(
				{
					code: NETWORK_ERROR,
					message: error instanceof Error ? error.message : 'Network error',
				},
				{ cause: error },
			);
		});
		this.#establishingChannel = undefined;
		return this.#channel;
	}

	/** Closes the current communication channel, if open. */
	async closeChannel(): Promise<void> {
		await this.#channel?.close();
	}

	/**
	 * Queries which ICRC standards the signer supports.
	 * Use this to determine signer capabilities before calling other methods.
	 *
	 * @see https://github.com/dfinity/wg-identity-authentication/blob/main/topics/icrc_25_signer_interaction_standard.md
	 */
	async getSupportedStandards(): Promise<SupportedStandard[]> {
		return this.#rpc({
			method: 'icrc25_supported_standards',
			decode: z
				.object({
					supportedStandards: z.array(z.object({ name: z.string(), url: z.string() })),
				})
				.transform((r) => r.supportedStandards),
		});
	}

	/**
	 * Requests the signer to grant permission for the given scopes.
	 * The signer may prompt the user for approval.
	 *
	 * @param scopes - The permission scopes to request.
	 * @returns The current state of each requested scope after the user's decision.
	 */
	async requestPermissions(
		scopes: PermissionScope[],
	): Promise<Array<{ scope: PermissionScope; state: PermissionState }>> {
		return this.#rpc({
			method: 'icrc25_request_permissions',
			params: scopes,
			encode: z.array(z.custom<PermissionScope>()).transform((scopes) => ({ scopes })),
			decode: z
				.object({
					scopes: z.array(
						z.object({
							scope: z.looseObject({ method: z.string() }),
							state: z.enum(['denied', 'ask_on_use', 'granted']),
						}),
					),
				})
				.transform((r) => r.scopes),
		});
	}

	/**
	 * Queries the current state of all permission scopes.
	 *
	 * @returns The current permission state for each scope the signer supports.
	 */
	async getPermissions(): Promise<Array<{ scope: PermissionScope; state: PermissionState }>> {
		return this.#rpc({
			method: 'icrc25_permissions',
			decode: z
				.object({
					scopes: z.array(
						z.object({
							scope: z.looseObject({ method: z.string() }),
							state: z.enum(['denied', 'ask_on_use', 'granted']),
						}),
					),
				})
				.transform((r) => r.scopes),
		});
	}

	/**
	 * Requests the accounts managed by the signer.
	 * Each account has an owner {@link Principal} and an optional 32-byte subaccount.
	 *
	 * Requires the `icrc27_accounts` permission scope.
	 *
	 * @see https://github.com/dfinity/wg-identity-authentication/blob/main/topics/icrc_27_accounts.md
	 */
	async getAccounts(): Promise<Array<{ owner: Principal; subaccount?: Uint8Array }>> {
		return this.#rpc({
			method: 'icrc27_accounts',
			decode: z
				.object({
					accounts: z.array(z.object({ owner: zPrincipal, subaccount: zBase64.optional() })),
				})
				.transform((r) => r.accounts),
		});
	}

	/**
	 * Requests a delegation chain from the signer for session-based authentication.
	 * This allows the relying party to sign canister calls without requiring
	 * user approval for each individual call.
	 *
	 * @param params.publicKey - The session's public key to delegate to.
	 * @param params.targets - Optional canister IDs to restrict the delegation to.
	 *   When provided, the signer creates an account delegation; otherwise a
	 *   relying party delegation.
	 * @param params.maxTimeToLive - Optional maximum delegation lifetime in nanoseconds.
	 * @returns A {@link DelegationChain} that can be used with `DelegationIdentity`.
	 *
	 * @see https://github.com/dfinity/wg-identity-authentication/blob/main/topics/icrc_34_delegation.md
	 */
	async requestDelegation(params: {
		publicKey: PublicKey;
		targets?: Principal[];
		maxTimeToLive?: bigint;
	}): Promise<DelegationChain> {
		return this.#rpc({
			method: 'icrc34_delegation',
			params,
			encode: z
				.object({
					publicKey: z.custom<PublicKey>(),
					targets: z.array(z.custom<Principal>()).optional(),
					maxTimeToLive: z.custom<bigint>().optional(),
				})
				.transform((v) => ({
					publicKey: z.util.uint8ArrayToBase64(new Uint8Array(v.publicKey.toDer())),
					targets: v.targets?.map((t) => t.toText()),
					maxTimeToLive: v.maxTimeToLive !== undefined ? String(v.maxTimeToLive) : undefined,
				})),
			decode: z
				.object({
					publicKey: zBase64,
					signerDelegation: z.array(
						z.object({
							delegation: z.object({
								pubkey: zBase64,
								expiration: z.coerce.bigint(),
								targets: z.array(zPrincipal).optional(),
							}),
							signature: zBase64,
						}),
					),
				})
				.transform((r) =>
					DelegationChain.fromDelegations(
						r.signerDelegation.map((d) => ({
							delegation: new Delegation(
								d.delegation.pubkey,
								d.delegation.expiration,
								d.delegation.targets,
							),
							signature: d.signature as Signature,
						})),
						r.publicKey,
					),
				),
		});
	}

	/**
	 * Requests the signer to execute a canister call on behalf of the user.
	 * The signer will prompt the user for approval before signing and
	 * submitting the call to the Internet Computer.
	 *
	 * @param params.canisterId - The target canister.
	 * @param params.sender - The principal executing the call.
	 * @param params.method - The canister method to invoke.
	 * @param params.arg - The Candid-encoded call arguments.
	 * @param params.nonce - Optional nonce (max 32 bytes) for replay protection.
	 * @returns The CBOR-encoded content map and certificate from the IC,
	 *   which can be used to verify the call's execution.
	 *
	 * @see https://github.com/dfinity/wg-identity-authentication/blob/main/topics/icrc_49_call_canister.md
	 */
	async callCanister(params: {
		canisterId: Principal;
		sender: Principal;
		method: string;
		arg: Uint8Array;
		nonce?: Uint8Array;
	}): Promise<{ contentMap: Uint8Array; certificate: Uint8Array }> {
		return this.#rpc({
			method: 'icrc49_call_canister',
			params,
			encode: z
				.object({
					canisterId: z.custom<Principal>(),
					sender: z.custom<Principal>(),
					method: z.string(),
					arg: z.custom<Uint8Array>(),
					nonce: z.custom<Uint8Array>().optional(),
				})
				.transform((v) => ({
					canisterId: v.canisterId.toText(),
					sender: v.sender.toText(),
					method: v.method,
					arg: z.util.uint8ArrayToBase64(v.arg),
					nonce: v.nonce !== undefined ? z.util.uint8ArrayToBase64(v.nonce) : undefined,
				})),
			decode: z.object({
				contentMap: zBase64,
				certificate: zBase64,
			}),
		});
	}

	/**
	 * Sends a JSON-RPC request to the signer and decodes the result.
	 * Handles encoding params, validating the response, and throwing
	 * {@link SignerError} on JSON-RPC errors or invalid results.
	 */
	async #rpc<T>(
		args: { method: string; decode: z.ZodType<T> } & (
			| { params: unknown; encode: z.ZodType<JsonRpcRequest['params']> }
			| { params?: never; encode?: never }
		),
	): Promise<T> {
		const response = await this.#sendRequest({
			id: this.#options.crypto.randomUUID(),
			jsonrpc: '2.0',
			method: args.method,
			params: args.encode ? args.encode.parse(args.params) : undefined,
		});
		if ('error' in response) {
			const parsed = JsonRpcErrorSchema.safeParse(response.error);
			if (parsed.success) {
				throw new SignerError(parsed.data);
			}
			throw new SignerError({
				code: GENERIC_ERROR,
				message: 'Invalid error response from signer',
			});
		}
		if ('result' in response) {
			const parsed = args.decode.safeParse(response.result);
			if (parsed.success) {
				return parsed.data;
			}
			throw new SignerError(
				{
					code: GENERIC_ERROR,
					message: `Invalid result from signer:\n${z.prettifyError(parsed.error)}`,
				},
				{ cause: parsed.error },
			);
		}
		throw new SignerError({
			code: GENERIC_ERROR,
			message: 'Invalid response',
		});
	}

	/** Sends a JSON-RPC request over the transport channel. */
	async #sendRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
		const channel = await this.openChannel();

		const { promise, resolve, reject } = Promise.withResolvers<JsonRpcResponse>();

		const responseListener = channel.addEventListener('response', (response) => {
			if (response.id !== request.id) {
				return;
			}

			responseListener();
			closeListener();
			resolve(response);

			if (this.#options.autoCloseTransportChannel) {
				this.#scheduledChannelClosure = setTimeout(() => {
					if (!channel.closed) {
						channel.close();
					}
				}, this.#options.closeTransportChannelAfter);
			}
		});

		const closeListener = channel.addEventListener('close', () => {
			responseListener();
			closeListener();
			reject(
				new SignerError({
					code: NETWORK_ERROR,
					message: 'Channel was closed before a response was received',
				}),
			);
		});

		try {
			await channel.send(await this.#transformRequest(request));
		} catch (error) {
			responseListener();
			closeListener();
			reject(
				new SignerError(
					{
						code: NETWORK_ERROR,
						message: error instanceof Error ? error.message : 'Network error',
					},
					{ cause: error },
				),
			);
		}

		return promise;
	}

	/**
	 * Appends the ICRC-95 derivation origin to the request params
	 * when configured.
	 *
	 * @see https://github.com/dfinity/wg-identity-authentication/blob/main/topics/icrc_95_derivationorigin.md
	 */
	async #transformRequest(request: JsonRpcRequest): Promise<JsonRpcRequest> {
		if (this.#options.derivationOrigin) {
			return {
				...request,
				params: {
					...request.params,
					icrc95DerivationOrigin: this.#options.derivationOrigin,
				},
			};
		}
		return request;
	}
}
