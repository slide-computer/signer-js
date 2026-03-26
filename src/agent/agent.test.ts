import {
	type CallOptions,
	Cbor,
	Certificate,
	LookupPathStatus,
	SubmitRequestType,
} from '@icp-sdk/core/agent';
import { Principal } from '@icp-sdk/core/principal';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Signer } from '../signer.js';
import type { Channel, Transport } from '../transport.js';
import { SignerAgent, SignerAgentError } from './agent.js';

const CANISTER_ID = Principal.fromText('ryjl3-tyaaa-aaaaa-aaaba-cai');
const ACCOUNT = Principal.fromText('sgymv-uiaaa-aaaaa-aaaia-cai');
const METHOD_NAME = 'transfer';
const ARG = new Uint8Array([1, 2, 3]);
const REPLY = new Uint8Array([4, 5, 6]);
const RAW_CERTIFICATE = new Uint8Array([7, 8, 9]);
const REQUEST_ID = new Uint8Array(32) as any; // RequestId

const CALL_FIELDS: CallOptions = {
	methodName: METHOD_NAME,
	arg: ARG,
	effectiveCanisterId: CANISTER_ID,
};

// Build a valid CBOR-encoded content map that decodeCallRequest will parse
const buildContentMap = () => {
	return Cbor.encode({
		request_type: SubmitRequestType.Call,
		canister_id: CANISTER_ID.toUint8Array(),
		method_name: METHOD_NAME,
		arg: ARG,
		sender: ACCOUNT.toUint8Array(),
		ingress_expiry: BigInt(0),
	});
};

// Mock Certificate.create to return a fake certificate
const mockCertificate = {
	lookup_path: vi.fn((path: unknown[]) => {
		const last = path[path.length - 1];
		if (last === 'reply') {
			return { status: LookupPathStatus.Found, value: REPLY };
		}
		if (last === 'status') {
			return {
				status: LookupPathStatus.Found,
				value: new TextEncoder().encode('replied'),
			};
		}
		return { status: LookupPathStatus.Absent };
	}),
};

vi.spyOn(Certificate, 'create').mockResolvedValue(mockCertificate as any);

// Mock requestIdOf to return a stable value
vi.mock('@icp-sdk/core/agent', async (importOriginal) => {
	const actual = (await importOriginal()) as any;
	return {
		...actual,
		requestIdOf: () => REQUEST_ID,
	};
});

const createMockSigner = (
	callCanisterResult = {
		contentMap: buildContentMap(),
		certificate: RAW_CERTIFICATE,
	},
) => {
	const mockChannel: Channel = {
		closed: false,
		addEventListener: () => () => {},
		send: vi.fn(async () => {}),
		close: vi.fn(async () => {}),
	};

	const signer = {
		openChannel: vi.fn(async () => mockChannel),
		closeChannel: vi.fn(async () => {}),
		callCanister: vi.fn(async () => callCanisterResult),
		supportedStandards: vi.fn(),
		accounts: vi.fn(),
		delegation: vi.fn(),
		batchCallCanister: vi.fn(),
		requestPermissions: vi.fn(),
		permissions: vi.fn(),
		sendRequest: vi.fn(),
		transformRequest: vi.fn(),
		transport: {} as Transport,
	} as unknown as Signer;

	return { signer, mockChannel };
};

const createMockHttpAgent = () =>
	({
		rootKey: null,
		fetchRootKey: vi.fn(async () => new Uint8Array()),
		status: vi.fn(async () => ({})),
	}) as any;

const createAgent = async (signerOverrides?: Partial<Signer>) => {
	const { signer } = createMockSigner();
	Object.assign(signer, signerOverrides);
	const agent = await createMockHttpAgent();
	return SignerAgent.createSync({
		signer,
		account: ACCOUNT,
		agent,
	});
};

beforeEach(() => {
	vi.clearAllMocks();
	mockCertificate.lookup_path.mockImplementation((path: unknown[]) => {
		const last = path[path.length - 1];
		if (last === 'reply') {
			return { status: LookupPathStatus.Found, value: REPLY };
		}
		if (last === 'status') {
			return {
				status: LookupPathStatus.Found,
				value: new TextEncoder().encode('replied'),
			};
		}
		return { status: LookupPathStatus.Absent };
	});
});

describe('SignerAgent', () => {
	describe('construction', () => {
		it('cannot be constructed directly', () => {
			expect(() => new (SignerAgent as any)({})).toThrow('SignerAgent is not constructable');
		});

		it('creates via createSync', () => {
			const { signer } = createMockSigner();
			const agent = SignerAgent.createSync({
				signer,
				account: ACCOUNT,
				agent: createMockHttpAgent(),
			});
			expect(agent).toBeInstanceOf(SignerAgent);
		});

		it('creates via async create', async () => {
			const { signer } = createMockSigner();
			const agent = await SignerAgent.create({
				signer,
				account: ACCOUNT,
				agent: createMockHttpAgent(),
			});
			expect(agent).toBeInstanceOf(SignerAgent);
		});
	});

	describe('signer', () => {
		it('returns the signer', () => {
			const { signer } = createMockSigner();
			const agent = SignerAgent.createSync({
				signer,
				account: ACCOUNT,
				agent: createMockHttpAgent(),
			});
			expect(agent.signer).toBe(signer);
		});
	});

	describe('getPrincipal', () => {
		it('returns the account principal', async () => {
			const agent = await createAgent();
			const principal = await agent.getPrincipal();
			expect(principal.toText()).toBe(ACCOUNT.toText());
		});
	});

	describe('replaceAccount', () => {
		it('changes the account principal', async () => {
			const agent = await createAgent();
			const newAccount = Principal.fromText('ryjl3-tyaaa-aaaaa-aaaba-cai');
			agent.replaceAccount(newAccount);
			const principal = await agent.getPrincipal();
			expect(principal.toText()).toBe(newAccount.toText());
		});
	});

	describe('call', () => {
		it('opens channel and calls signer', async () => {
			const { signer } = createMockSigner();
			const agent = SignerAgent.createSync({
				signer,
				account: ACCOUNT,
				agent: createMockHttpAgent(),
			});

			const result = await agent.call(CANISTER_ID, CALL_FIELDS);

			expect(signer.openChannel).toHaveBeenCalled();
			expect(signer.callCanister).toHaveBeenCalledWith({
				canisterId: CANISTER_ID,
				sender: ACCOUNT,
				method: METHOD_NAME,
				arg: ARG,
			});
			expect(result.response.ok).toBe(true);
			expect(result.response.status).toBe(202);
			expect(result.requestId).toBeDefined();
		});

		it('accepts string canisterId', async () => {
			const { signer } = createMockSigner();
			const agent = SignerAgent.createSync({
				signer,
				account: ACCOUNT,
				agent: createMockHttpAgent(),
			});

			const result = await agent.call(CANISTER_ID.toText(), CALL_FIELDS);
			expect(result.response.ok).toBe(true);
		});

		it('rejects if content map does not match request', async () => {
			const mismatchedContentMap = Cbor.encode({
				request_type: SubmitRequestType.Call,
				canister_id: CANISTER_ID.toUint8Array(),
				method_name: 'wrong_method',
				arg: ARG,
				sender: ACCOUNT.toUint8Array(),
				ingress_expiry: BigInt(0),
			});

			const { signer } = createMockSigner({
				contentMap: mismatchedContentMap,
				certificate: RAW_CERTIFICATE,
			});
			const agent = SignerAgent.createSync({
				signer,
				account: ACCOUNT,
				agent: createMockHttpAgent(),
			});

			await expect(agent.call(CANISTER_ID, CALL_FIELDS)).rejects.toThrow(SignerAgentError);
		});

		it('rejects if certificate validation fails', async () => {
			vi.spyOn(Certificate, 'create').mockRejectedValueOnce(new Error('invalid cert'));

			const agent = await createAgent();

			await expect(agent.call(CANISTER_ID, CALL_FIELDS)).rejects.toSatisfy((error: unknown) => {
				expect(error).toBeInstanceOf(SignerAgentError);
				expect((error as SignerAgentError).cause).toBeInstanceOf(Error);
				return true;
			});
		});

		it('rejects if reply not found in certificate', async () => {
			mockCertificate.lookup_path.mockReturnValue({
				status: LookupPathStatus.Absent,
			});

			const agent = await createAgent();

			await expect(agent.call(CANISTER_ID, CALL_FIELDS)).rejects.toThrow(SignerAgentError);
		});
	});

	describe('update', () => {
		it('returns certificate, reply, and raw certificate', async () => {
			const agent = await createAgent();

			const result = await agent.update(CANISTER_ID, CALL_FIELDS);

			expect(result.reply).toEqual(REPLY);
			expect(result.certificate).toBe(mockCertificate);
			expect(result.rawCertificate).toEqual(RAW_CERTIFICATE);
			expect(result.callResponse.ok).toBe(true);
		});
	});

	describe('query', () => {
		it('upgrades query to call and returns reply', async () => {
			const agent = await createAgent();

			const result = await agent.query(CANISTER_ID, {
				methodName: METHOD_NAME,
				arg: ARG,
			});

			expect(result.status).toBe('replied');
			if (result.status !== 'replied') throw new Error('unexpected');
			expect(result.reply.arg).toEqual(REPLY);
		});
	});

	describe('readState', () => {
		it('returns stored certificate after call', async () => {
			const agent = await createAgent();
			await agent.call(CANISTER_ID, CALL_FIELDS);

			const result = await agent.readState(CANISTER_ID, {
				paths: [[new TextEncoder().encode('request_status'), REQUEST_ID]],
			});

			expect(result.certificate).toEqual(RAW_CERTIFICATE);
		});

		it('deletes certificate after readState', async () => {
			const agent = await createAgent();
			await agent.call(CANISTER_ID, CALL_FIELDS);

			await agent.readState(CANISTER_ID, {
				paths: [[new TextEncoder().encode('request_status'), REQUEST_ID]],
			});

			await expect(
				agent.readState(CANISTER_ID, {
					paths: [[new TextEncoder().encode('request_status'), REQUEST_ID]],
				}),
			).rejects.toThrow('Certificate could not be found');
		});

		it('rejects unsupported paths', async () => {
			const agent = await createAgent();

			await expect(agent.readState(CANISTER_ID, { paths: [] })).rejects.toThrow(
				'Given paths are not supported',
			);
		});
	});

	describe('sequential execution', () => {
		it('executes calls sequentially through the queue', async () => {
			const callOrder: number[] = [];

			const { signer } = createMockSigner();
			(signer.callCanister as any).mockImplementation(async () => {
				const index = callOrder.length;
				callOrder.push(index);
				// Second call takes longer
				if (index === 1) {
					await new Promise((r) => setTimeout(r, 10));
				}
				return {
					contentMap: buildContentMap(),
					certificate: RAW_CERTIFICATE,
				};
			});

			const agent = SignerAgent.createSync({
				signer,
				account: ACCOUNT,
				agent: createMockHttpAgent(),
			});

			const [result1, result2] = await Promise.all([
				agent.call(CANISTER_ID, CALL_FIELDS),
				agent.call(CANISTER_ID, CALL_FIELDS),
			]);

			expect(result1.response.ok).toBe(true);
			expect(result2.response.ok).toBe(true);
			expect(callOrder).toEqual([0, 1]);
		});
	});

	describe('fetchRootKey', () => {
		it('delegates to HttpAgent', async () => {
			const httpAgent = createMockHttpAgent();
			httpAgent.fetchRootKey.mockResolvedValue(new Uint8Array([1, 2, 3]));

			const { signer } = createMockSigner();
			const agent = SignerAgent.createSync({
				signer,
				account: ACCOUNT,
				agent: httpAgent,
			});

			const rootKey = await agent.fetchRootKey();
			expect(rootKey).toEqual(new Uint8Array([1, 2, 3]));
		});
	});

	describe('status', () => {
		it('delegates to HttpAgent', async () => {
			const httpAgent = createMockHttpAgent();
			httpAgent.status.mockResolvedValue({ key: 'value' });

			const { signer } = createMockSigner();
			const agent = SignerAgent.createSync({
				signer,
				account: ACCOUNT,
				agent: httpAgent,
			});

			const status = await agent.status();
			expect(status).toEqual({ key: 'value' });
		});
	});
});
