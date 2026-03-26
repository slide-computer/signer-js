import { Principal } from '@icp-sdk/core/principal';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Signer, SignerError } from './signer.js';
import type { Channel, JsonRpcRequest, JsonRpcResponse, Transport } from './transport.js';

const NETWORK_ERROR = 4000;

const createMockChannel = (respondWith: (request: JsonRpcRequest) => JsonRpcResponse): Channel => {
	const closeListeners = new Set<() => void>();
	let responseListener: ((response: JsonRpcResponse) => void) | undefined;

	return {
		closed: false,
		addEventListener(...args: [string, (...args: any[]) => void]) {
			const [event, listener] = args;
			if (event === 'response') {
				responseListener = listener;
				return () => {
					responseListener = undefined;
				};
			}
			if (event === 'close') {
				closeListeners.add(listener);
				return () => {
					closeListeners.delete(listener);
				};
			}
			return () => {};
		},
		async send(request: JsonRpcRequest) {
			// Simulate async signer response
			queueMicrotask(() => {
				responseListener?.(respondWith(request));
			});
		},
		async close() {
			this.closed = true;
			closeListeners.forEach((l) => l());
		},
	};
};

const createMockTransport = (
	respondWith: (request: JsonRpcRequest) => JsonRpcResponse,
): Transport => ({
	establishChannel: () => Promise.resolve(createMockChannel(respondWith)),
});

let idCounter = 0;
const mockCrypto = { randomUUID: () => `test-id-${++idCounter}` } as Pick<Crypto, 'randomUUID'>;

const createSigner = (respondWith: (request: JsonRpcRequest) => JsonRpcResponse) => {
	const transport = createMockTransport(respondWith);
	return new Signer({ transport, crypto: mockCrypto });
};

beforeEach(() => {
	idCounter = 0;
});

describe('Signer', () => {
	describe('transport', () => {
		it('returns the transport', () => {
			const transport = createMockTransport(() => ({
				jsonrpc: '2.0',
				id: 1,
				result: '',
			}));
			const signer = new Signer({ transport, crypto: mockCrypto });
			expect(signer.transport).toBe(transport);
		});
	});

	describe('openChannel', () => {
		it('establishes a channel', async () => {
			const transport = createMockTransport(() => ({
				jsonrpc: '2.0',
				id: 1,
				result: '',
			}));
			const channel = await new Signer({
				transport,
				crypto: mockCrypto,
			}).openChannel();
			expect(channel.closed).toBe(false);
		});

		it('reuses an existing open channel', async () => {
			const transport = createMockTransport(() => ({
				jsonrpc: '2.0',
				id: 1,
				result: '',
			}));
			const spy = vi.spyOn(transport, 'establishChannel');
			const signer = new Signer({ transport, crypto: mockCrypto });

			const channel1 = await signer.openChannel();
			const channel2 = await signer.openChannel();

			expect(channel1).toBe(channel2);
			expect(spy).toHaveBeenCalledTimes(1);
		});

		it('establishes a new channel after closing', async () => {
			const transport = createMockTransport(() => ({
				jsonrpc: '2.0',
				id: 1,
				result: '',
			}));
			const spy = vi.spyOn(transport, 'establishChannel');
			const signer = new Signer({ transport, crypto: mockCrypto });

			await signer.openChannel();
			await signer.closeChannel();
			await signer.openChannel();

			expect(spy).toHaveBeenCalledTimes(2);
		});

		it('wraps transport errors as SignerError with cause', async () => {
			const transportError = new Error('connection failed');
			const transport: Transport = {
				establishChannel: () => Promise.reject(transportError),
			};
			const signer = new Signer({ transport, crypto: mockCrypto });

			await expect(signer.openChannel()).rejects.toSatisfy((error: unknown) => {
				expect(error).toBeInstanceOf(SignerError);
				expect((error as SignerError).code).toBe(NETWORK_ERROR);
				expect((error as SignerError).cause).toBe(transportError);
				return true;
			});
		});
	});

	describe('supportedStandards', () => {
		it('returns supported standards', async () => {
			const signer = createSigner((request) => ({
				jsonrpc: '2.0',
				id: request.id!,
				result: {
					supportedStandards: [
						{ name: 'ICRC-25', url: 'https://example.com' },
						{ name: 'ICRC-27', url: 'https://example.com' },
					],
				},
			}));

			const standards = await signer.getSupportedStandards();

			expect(standards).toEqual([
				{ name: 'ICRC-25', url: 'https://example.com' },
				{ name: 'ICRC-27', url: 'https://example.com' },
			]);
		});
	});

	describe('requestPermissions', () => {
		it('sends scopes and returns permission states', async () => {
			const signer = createSigner((request) => ({
				jsonrpc: '2.0',
				id: request.id!,
				result: {
					scopes: [{ scope: { method: 'icrc27_accounts' }, state: 'granted' }],
				},
			}));

			const result = await signer.requestPermissions([{ method: 'icrc27_accounts' }]);

			expect(result).toEqual([{ scope: { method: 'icrc27_accounts' }, state: 'granted' }]);
		});
	});

	describe('permissions', () => {
		it('returns current permissions', async () => {
			const signer = createSigner((request) => ({
				jsonrpc: '2.0',
				id: request.id!,
				result: {
					scopes: [{ scope: { method: 'icrc27_accounts' }, state: 'denied' }],
				},
			}));

			const result = await signer.getPermissions();

			expect(result).toEqual([{ scope: { method: 'icrc27_accounts' }, state: 'denied' }]);
		});
	});

	describe('accounts', () => {
		it('returns parsed accounts with Principal owners', async () => {
			const principal = Principal.fromText('sgymv-uiaaa-aaaaa-aaaia-cai');
			const signer = createSigner((request) => ({
				jsonrpc: '2.0',
				id: request.id!,
				result: {
					accounts: [{ owner: principal.toText() }],
				},
			}));

			const accounts = await signer.getAccounts();

			expect(accounts).toHaveLength(1);
			expect(accounts[0].owner.toText()).toBe(principal.toText());
			expect(accounts[0].subaccount).toBeUndefined();
		});

		it('decodes base64 subaccounts', async () => {
			const signer = createSigner((request) => ({
				jsonrpc: '2.0',
				id: request.id!,
				result: {
					accounts: [
						{
							owner: 'sgymv-uiaaa-aaaaa-aaaia-cai',
							subaccount: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE=',
						},
					],
				},
			}));

			const accounts = await signer.getAccounts();

			expect(accounts[0].subaccount).toBeInstanceOf(Uint8Array);
			expect(accounts[0].subaccount![31]).toBe(1);
		});
	});

	describe('callCanister', () => {
		it('sends call and returns decoded contentMap and certificate', async () => {
			const contentMap = btoa('contentMap');
			const certificate = btoa('certificate');

			const signer = createSigner((request) => ({
				jsonrpc: '2.0',
				id: request.id!,
				result: { contentMap, certificate },
			}));

			const result = await signer.callCanister({
				canisterId: Principal.fromText('sgymv-uiaaa-aaaaa-aaaia-cai'),
				sender: Principal.fromText('sgymv-uiaaa-aaaaa-aaaia-cai'),
				method: 'transfer',
				arg: new Uint8Array([1, 2, 3]),
			});

			expect(result.contentMap).toBeInstanceOf(Uint8Array);
			expect(result.certificate).toBeInstanceOf(Uint8Array);
		});
	});

	describe('error handling', () => {
		it('throws SignerError on JSON-RPC error response', async () => {
			const signer = createSigner((request) => ({
				jsonrpc: '2.0',
				id: request.id!,
				error: { code: 3000, message: 'Permission not granted' },
			}));

			await expect(signer.getSupportedStandards()).rejects.toSatisfy((error: unknown) => {
				expect(error).toBeInstanceOf(SignerError);
				expect((error as SignerError).code).toBe(3000);
				expect((error as SignerError).message).toBe('Permission not granted');
				return true;
			});
		});

		it('throws SignerError when channel closes before response', async () => {
			const closeListeners = new Set<() => void>();
			const transport: Transport = {
				establishChannel: () =>
					Promise.resolve({
						closed: false,
						addEventListener(...args: [string, (...args: any[]) => void]) {
							const [event, listener] = args;
							if (event === 'close') {
								closeListeners.add(listener);
								return () => {
									closeListeners.delete(listener);
								};
							}
							return () => {};
						},
						async send() {
							// Close the channel after send instead of responding
							queueMicrotask(() => closeListeners.forEach((l) => l()));
						},
						async close() {},
					}),
			};

			const signer = new Signer({ transport, crypto: mockCrypto });

			await expect(signer.getSupportedStandards()).rejects.toSatisfy((error: unknown) => {
				expect(error).toBeInstanceOf(SignerError);
				expect((error as SignerError).code).toBe(NETWORK_ERROR);
				return true;
			});
		});

		it('throws SignerError when channel.send fails', async () => {
			const sendError = new Error('send failed');
			const transport: Transport = {
				establishChannel: () =>
					Promise.resolve({
						closed: false,
						addEventListener: () => () => {},
						async send() {
							throw sendError;
						},
						async close() {},
					}),
			};
			const signer = new Signer({ transport, crypto: mockCrypto });

			await expect(signer.getSupportedStandards()).rejects.toSatisfy((error: unknown) => {
				expect(error).toBeInstanceOf(SignerError);
				expect((error as SignerError).code).toBe(NETWORK_ERROR);
				expect((error as SignerError).cause).toBe(sendError);
				return true;
			});
		});
	});

	describe('transformRequest', () => {
		it('adds derivationOrigin to params when configured', async () => {
			let sentRequest: JsonRpcRequest | undefined;
			const transport: Transport = {
				establishChannel: () =>
					Promise.resolve(
						createMockChannel((request) => {
							sentRequest = request;
							return {
								jsonrpc: '2.0',
								id: request.id!,
								result: { supportedStandards: [] },
							};
						}),
					),
			};

			const signer = new Signer({
				transport,
				crypto: mockCrypto,
				derivationOrigin: 'https://example.com',
			});
			await signer.getSupportedStandards();

			expect(sentRequest?.params).toHaveProperty('icrc95DerivationOrigin', 'https://example.com');
		});

		it('does not add derivationOrigin when not configured', async () => {
			let sentRequest: JsonRpcRequest | undefined;
			const transport: Transport = {
				establishChannel: () =>
					Promise.resolve(
						createMockChannel((request) => {
							sentRequest = request;
							return {
								jsonrpc: '2.0',
								id: request.id!,
								result: { supportedStandards: [] },
							};
						}),
					),
			};

			const signer = new Signer({ transport, crypto: mockCrypto });
			await signer.getSupportedStandards();

			expect(
				(sentRequest?.params as Record<string, unknown>)?.icrc95DerivationOrigin,
			).toBeUndefined();
		});
	});

	describe('sendRequest', () => {
		it('ignores responses with non-matching ids', async () => {
			const transport: Transport = {
				establishChannel: () =>
					Promise.resolve({
						closed: false,
						addEventListener(...args: [string, (...args: any[]) => void]) {
							const [event, listener] = args;
							if (event === 'response') {
								// First send a response with wrong id, then correct one
								queueMicrotask(() => {
									listener({
										jsonrpc: '2.0',
										id: 'wrong-id',
										result: {
											supportedStandards: [{ name: 'wrong', url: '' }],
										},
									});
									listener({
										jsonrpc: '2.0',
										id: 'test-id-1',
										result: {
											supportedStandards: [{ name: 'correct', url: '' }],
										},
									});
								});
								return () => {};
							}
							return () => {};
						},
						async send() {},
						async close() {},
					}),
			};

			const signer = new Signer({ transport, crypto: mockCrypto });
			const standards = await signer.getSupportedStandards();

			expect(standards).toEqual([{ name: 'correct', url: '' }]);
		});
	});
});
