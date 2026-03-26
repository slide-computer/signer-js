import { describe, expect, it, vi } from 'vitest';
import { BrowserExtensionChannel } from './browserExtensionChannel.js';
import { BrowserExtensionTransportError } from './browserExtensionTransport.js';
import type { ProviderDetail } from './types.js';

const createMockWindow = () => {
	const listeners = new Map<string, Set<(event: any) => void>>();
	return {
		addEventListener: vi.fn((event: string, listener: (event: any) => void) => {
			if (!listeners.has(event)) listeners.set(event, new Set());
			listeners.get(event)!.add(listener);
		}),
		removeEventListener: vi.fn((event: string, listener: (event: any) => void) => {
			listeners.get(event)?.delete(listener);
		}),
		dispatch: (event: string) => {
			listeners.get(event)?.forEach((l) => l({}));
		},
	};
};

const createMockProviderDetail = (overrides?: Partial<ProviderDetail>): ProviderDetail => ({
	uuid: 'test-uuid',
	name: 'Test Extension',
	icon: 'data:image/svg+xml,test',
	rdns: 'com.test.extension',
	sendMessage: vi.fn(async () => undefined),
	dismiss: vi.fn(async () => {}),
	...overrides,
});

const createChannel = (
	overrides?: Partial<{
		providerDetail: ProviderDetail;
	}>,
) => {
	const mockWindow = createMockWindow();
	const providerDetail = overrides?.providerDetail ?? createMockProviderDetail();
	const channel = new BrowserExtensionChannel({
		providerDetail,
		window: mockWindow as any,
	});
	return { channel, mockWindow, providerDetail };
};

describe('BrowserExtensionChannel', () => {
	describe('send', () => {
		it('sends request via providerDetail.sendMessage', async () => {
			const { channel, providerDetail } = createChannel();
			const request = { jsonrpc: '2.0' as const, id: 1, method: 'test' };

			await channel.send(request);

			expect(providerDetail.sendMessage).toHaveBeenCalledWith(request);
		});

		it('dispatches JSON-RPC responses to listeners', async () => {
			const providerDetail = createMockProviderDetail({
				sendMessage: vi.fn(async () => ({
					jsonrpc: '2.0',
					id: 1,
					result: 'ok',
				})),
			});
			const { channel } = createChannel({ providerDetail });
			const listener = vi.fn();
			channel.addEventListener('response', listener);

			await channel.send({ jsonrpc: '2.0', id: 1, method: 'test' });

			expect(listener).toHaveBeenCalledWith({
				jsonrpc: '2.0',
				id: 1,
				result: 'ok',
			});
		});

		it('ignores non-JSON-RPC responses from sendMessage', async () => {
			const providerDetail = createMockProviderDetail({
				sendMessage: vi.fn(async () => ({ some: 'random data' })),
			});
			const { channel } = createChannel({ providerDetail });
			const listener = vi.fn();
			channel.addEventListener('response', listener);

			await channel.send({ jsonrpc: '2.0', id: 1, method: 'test' });

			expect(listener).not.toHaveBeenCalled();
		});

		it('throws when channel is closed', async () => {
			const { channel } = createChannel();
			await channel.close();

			await expect(channel.send({ jsonrpc: '2.0', id: 1, method: 'test' })).rejects.toThrow(
				BrowserExtensionTransportError,
			);
		});
	});

	describe('close', () => {
		it('calls providerDetail.dismiss', async () => {
			const { channel, providerDetail } = createChannel();

			await channel.close();

			expect(channel.closed).toBe(true);
			expect(providerDetail.dismiss).toHaveBeenCalled();
		});

		it('notifies close listeners', async () => {
			const { channel } = createChannel();
			const listener = vi.fn();
			channel.addEventListener('close', listener);

			await channel.close();

			expect(listener).toHaveBeenCalled();
		});

		it('is idempotent', async () => {
			const { channel, providerDetail } = createChannel();

			await channel.close();
			await channel.close();

			expect(providerDetail.dismiss).toHaveBeenCalledTimes(1);
		});
	});

	describe('addEventListener', () => {
		it('unsubscribes response listener', async () => {
			const providerDetail = createMockProviderDetail({
				sendMessage: vi.fn(async () => ({
					jsonrpc: '2.0',
					id: 1,
					result: 'ok',
				})),
			});
			const { channel } = createChannel({ providerDetail });
			const listener = vi.fn();
			const unsubscribe = channel.addEventListener('response', listener);

			unsubscribe();
			await channel.send({ jsonrpc: '2.0', id: 1, method: 'test' });

			expect(listener).not.toHaveBeenCalled();
		});

		it('unsubscribes close listener', async () => {
			const { channel } = createChannel();
			const listener = vi.fn();
			const unsubscribe = channel.addEventListener('close', listener);

			unsubscribe();
			await channel.close();

			expect(listener).not.toHaveBeenCalled();
		});
	});

	describe('icrc94:unexpectedlyClosed', () => {
		it('closes channel when unexpectedlyClosed event fires', () => {
			const { channel, mockWindow } = createChannel();
			const listener = vi.fn();
			channel.addEventListener('close', listener);

			mockWindow.dispatch('icrc94:unexpectedlyClosed');

			expect(channel.closed).toBe(true);
			expect(listener).toHaveBeenCalled();
		});
	});
});
