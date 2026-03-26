import {
	type Agent,
	type ApiQueryResponse,
	type CallOptions,
	type CallRequest,
	Cbor,
	Certificate,
	Expiry,
	HttpAgent,
	IC_ROOT_KEY,
	type Identity,
	JSON_KEY_EXPIRY,
	LookupPathStatus,
	type QueryFields,
	type QueryResponseStatus,
	type ReadStateOptions,
	type ReadStateResponse,
	type RequestId,
	requestIdOf,
	SubmitRequestType,
	type SubmitResponse,
	type UpdateResult,
} from '@icp-sdk/core/agent';
import { type JsonObject, uint8Equals } from '@icp-sdk/core/candid';
import { Principal } from '@icp-sdk/core/principal';
import type { Signer, Transport } from '../index.js';

// Hex helpers — use native Uint8Array methods when available
const fromHex = (hex: string): Uint8Array => {
	if ('fromHex' in Uint8Array && typeof Uint8Array.fromHex === 'function') {
		return Uint8Array.fromHex(hex);
	}
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return bytes;
};

const toHex = (bytes: Uint8Array): string => {
	if ('toHex' in bytes && typeof bytes.toHex === 'function') {
		return bytes.toHex();
	}
	let hex = '';
	for (let i = 0; i < bytes.byteLength; i++) {
		hex += bytes[i].toString(16).padStart(2, '0');
	}
	return hex;
};

// IC root key as bytes, used as fallback when agent has no root key
const ROOT_KEY = fromHex(IC_ROOT_KEY);

const MAX_AGE_IN_MINUTES = 5;
const INVALID_RESPONSE_MESSAGE = 'Received invalid response from signer';

/** Options for creating a {@link SignerAgent}. */
export interface SignerAgentOptions<T extends Transport = Transport> {
	/** The {@link Signer} used to send ICRC-49 canister call requests. */
	signer: Signer<T>;
	/** The principal of the account on whose behalf canister calls are made. */
	account: Principal;
	/**
	 * An {@link HttpAgent} used for fetching the root key and status.
	 * @default A new HttpAgent connected to the IC mainnet.
	 */
	agent?: HttpAgent;
}

/**
 * Error thrown by {@link SignerAgent} when a signer returns an invalid
 * response or certificate validation fails.
 */
export class SignerAgentError extends Error {}

interface VerifiedCall {
	requestId: RequestId;
	requestBody: CallRequest;
	certificate: Certificate;
	rawCertificate: Uint8Array;
	reply: Uint8Array;
}

/**
 * An {@link Agent} implementation that routes canister calls through a
 * {@link Signer} for user approval. Drop-in replacement for {@link HttpAgent}
 * when canister calls need to be signed by an external signer.
 *
 * Calls are sent to the signer via ICRC-49, and the returned content map
 * and certificate are validated before being returned to the caller.
 *
 * Use {@link SignerAgent.create} or {@link SignerAgent.createSync} to
 * construct an instance — the constructor is private.
 *
 * @example
 * ```ts
 * const agent = await SignerAgent.create({ signer, account });
 * const result = await agent.update(canisterId, { methodName: "transfer", arg, effectiveCanisterId: canisterId });
 * ```
 */
export class SignerAgent<T extends Transport = Transport> implements Agent {
	static #isInternalConstructing: boolean = false;
	readonly #options: Required<SignerAgentOptions>;
	readonly #certificates = new Map<string, Uint8Array>();
	#pending: Promise<void> = Promise.resolve();

	private constructor(options: Required<SignerAgentOptions>) {
		const throwError = !SignerAgent.#isInternalConstructing;
		SignerAgent.#isInternalConstructing = false;
		if (throwError) {
			throw new SignerAgentError('SignerAgent is not constructable');
		}
		this.#options = options;
	}

	/** The root key used for certificate verification. */
	get rootKey() {
		return this.#options.agent.rootKey ?? ROOT_KEY;
	}

	/** The signer this agent routes calls through. */
	get signer(): Signer<T> {
		return this.#options.signer as unknown as Signer<T>;
	}

	/**
	 * Creates a new SignerAgent, asynchronously initializing the
	 * underlying HttpAgent if one is not provided.
	 */
	static async create<T extends Transport>(options: SignerAgentOptions<T>) {
		SignerAgent.#isInternalConstructing = true;
		return new SignerAgent({
			...options,
			agent: options.agent ?? (await HttpAgent.create()),
		}) as SignerAgent<T>;
	}

	/**
	 * Creates a new SignerAgent synchronously.
	 * Use this when you already have an HttpAgent or don't need async initialization.
	 */
	static createSync<T extends Transport>(options: SignerAgentOptions<T>) {
		SignerAgent.#isInternalConstructing = true;
		return new SignerAgent({
			...options,
			agent: options.agent ?? HttpAgent.createSync(),
		}) as SignerAgent<T>;
	}

	/**
	 * Sends a canister call through the signer, validates the content map
	 * and certificate, and returns the verified result.
	 *
	 * Calls are queued to ensure sequential execution — the signer's
	 * transport channel is opened first to avoid blocking popups.
	 */
	async #sendAndVerify(canisterId: Principal, fields: CallOptions): Promise<VerifiedCall> {
		await this.#options.signer.openChannel();

		// Queue calls to ensure sequential execution through the signer
		const response = await new Promise<Awaited<ReturnType<Signer['callCanister']>>>(
			(resolve, reject) => {
				this.#pending = this.#pending.finally(() =>
					this.signer
						.callCanister({
							canisterId,
							sender: this.#options.account,
							method: fields.methodName,
							arg: fields.arg,
							nonce: fields.nonce,
						})
						.then(resolve, reject),
				);
			},
		);

		// Decode CBOR content map and reconstruct the Expiry
		// (Expiry has a private constructor, so we use the JSON round-trip)
		const decoded = Cbor.decode<Record<string, unknown>>(response.contentMap);
		const requestBody = {
			...decoded,
			canister_id: Principal.from(decoded.canister_id),
			ingress_expiry: Expiry.fromJSON(
				JSON.stringify({ [JSON_KEY_EXPIRY]: String(decoded.ingress_expiry) }),
			),
		} as CallRequest;

		// Verify the content map matches what we requested
		const contentMapMatchesRequest =
			SubmitRequestType.Call === requestBody.request_type &&
			canisterId.toText() === requestBody.canister_id.toText() &&
			fields.methodName === requestBody.method_name &&
			uint8Equals(fields.arg, requestBody.arg) &&
			this.#options.account.toText() === Principal.from(requestBody.sender).toText();
		if (!contentMapMatchesRequest) {
			throw new SignerAgentError(INVALID_RESPONSE_MESSAGE);
		}

		// Validate the certificate against the IC root key
		const requestId = requestIdOf(requestBody);
		const certificate = await Certificate.create({
			certificate: response.certificate,
			rootKey: this.rootKey,
			principal: { canisterId },
			maxAgeInMinutes: MAX_AGE_IN_MINUTES,
		}).catch((cause) => {
			throw new SignerAgentError(INVALID_RESPONSE_MESSAGE, { cause });
		});

		// Extract the reply from the certified state tree
		const replyLookup = certificate.lookup_path(['request_status', requestId, 'reply']);
		if (replyLookup.status !== LookupPathStatus.Found) {
			throw new SignerAgentError(INVALID_RESPONSE_MESSAGE);
		}

		// Store raw certificate for readState lookups, deleted on first read
		this.#certificates.set(toHex(requestId), response.certificate);

		return {
			requestId,
			requestBody,
			certificate,
			rawCertificate: response.certificate,
			reply: replyLookup.value,
		};
	}

	/**
	 * Sends a canister call through the signer.
	 * Returns the request ID and a synthetic HTTP response.
	 */
	async call(canisterId: Principal | string, fields: CallOptions): Promise<SubmitResponse> {
		canisterId = Principal.from(canisterId);
		const { requestId, requestBody } = await this.#sendAndVerify(canisterId, fields);
		return {
			requestId,
			response: {
				ok: true,
				status: 202,
				statusText: 'Call has been sent over ICRC-25 JSON-RPC',
				body: null,
				headers: [],
			},
			requestDetails: requestBody,
		};
	}

	/**
	 * Executes a canister update call and returns the certified result.
	 * Combines {@link call} with certificate validation and reply extraction.
	 *
	 * @param _pollingOptions - Ignored. The signer already returns the
	 *   certificate with the reply in a single round-trip.
	 */
	async update(
		canisterId: Principal | string,
		fields: CallOptions,
		_pollingOptions?: unknown,
	): Promise<UpdateResult> {
		canisterId = Principal.from(canisterId);
		const { requestBody, certificate, rawCertificate, reply } = await this.#sendAndVerify(
			canisterId,
			fields,
		);
		return {
			certificate,
			reply,
			rawCertificate,
			requestDetails: requestBody,
			callResponse: {
				ok: true,
				status: 202,
				statusText: 'Call has been sent over ICRC-25 JSON-RPC',
				body: null,
				headers: [],
			},
		};
	}

	/**
	 * Executes a query by upgrading it to a canister call through the signer.
	 * The signer signs and submits the call, and the reply is extracted
	 * from the certified response.
	 *
	 * @param _identity - Ignored. The signer manages identity internally.
	 */
	async query(
		canisterId: Principal | string,
		options: QueryFields,
		_identity?: Identity | Promise<Identity>,
	): Promise<ApiQueryResponse> {
		canisterId = Principal.from(canisterId);
		const { requestId, reply } = await this.#sendAndVerify(canisterId, {
			methodName: options.methodName,
			arg: options.arg,
			effectiveCanisterId: canisterId,
		});
		return {
			requestId,
			status: 'replied' as QueryResponseStatus.Replied,
			reply: { arg: reply },
			httpDetails: {
				ok: true,
				status: 202,
				statusText: 'Certificate with reply has been received over ICRC-25 JSON-RPC',
				headers: [],
			},
		};
	}

	/** Fetches the IC root key via the underlying HttpAgent. */
	async fetchRootKey(): Promise<Uint8Array> {
		return this.#options.agent.fetchRootKey();
	}

	/** Returns the account principal this agent makes calls on behalf of. */
	async getPrincipal(): Promise<Principal> {
		return this.#options.account;
	}

	/** @internal Required by the Agent interface but not used for signer calls. */
	async createReadStateRequest(_options: ReadStateOptions, _identity?: Identity): Promise<unknown> {
		return { body: { content: {} } };
	}

	/**
	 * Returns the raw certificate for a previously completed call.
	 * The certificate is deleted after being read (single-use).
	 *
	 * Only supports `request_status` paths for request IDs that were
	 * returned by a prior {@link call}, {@link update}, or {@link query}.
	 */
	async readState(
		_canisterId: Principal | string,
		options: ReadStateOptions,
		_identity?: Identity | Promise<Identity>,
		_request?: unknown,
	): Promise<ReadStateResponse> {
		if (
			options.paths.length !== 1 ||
			options.paths[0].length !== 2 ||
			new TextDecoder().decode(options.paths[0][0]) !== 'request_status'
		) {
			throw new SignerAgentError('Given paths are not supported');
		}
		const requestId = options.paths[0][1] as RequestId;
		const key = toHex(requestId);
		const certificate = this.#certificates.get(key);
		if (!certificate) {
			throw new SignerAgentError('Certificate could not be found');
		}
		this.#certificates.delete(key);
		return { certificate };
	}

	/** Queries the IC replica status via the underlying HttpAgent. */
	async status(): Promise<JsonObject> {
		return this.#options.agent.status();
	}

	/** Replaces the account principal used for subsequent calls. */
	replaceAccount(account: Principal) {
		this.#options.account = account;
	}
}
