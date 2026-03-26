import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	BrowserExtensionTransport,
	BrowserExtensionTransportError,
} from './browserExtensionTransport.js';
import type { ProviderDetail } from './types.js';

const PROVIDER: ProviderDetail = {
	uuid: '550e8400-e29b-41d4-a716-446655440000',
	name: 'Test Wallet',
	icon: 'data:image/svg+xml,test',
	rdns: 'com.test.wallet',
	sendMessage: vi.fn(async () => undefined),
	dismiss: vi.fn(async () => {}),
};

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
		dispatchEvent: vi.fn((event: any) => {
			// When icrc94:requestProvider is dispatched, simulate extensions announcing
			if (event.type === 'icrc94:requestProvider') {
				listeners.get('icrc94:announceProvider')?.forEach((l) => l({ detail: PROVIDER }));
			}
		}),
	};
};

beforeEach(() => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
	vi.useRealTimers();
});

describe('BrowserExtensionTransport', () => {
	describe('discover', () => {
		it('discovers announced providers', async () => {
			const mockWindow = createMockWindow();

			const providers = await BrowserExtensionTransport.discover({
				window: mockWindow as any,
				discoveryDuration: 10,
			});

			expect(mockWindow.dispatchEvent).toHaveBeenCalledWith(
				expect.objectContaining({ type: 'icrc94:requestProvider' }),
			);
			expect(providers).toHaveLength(1);
			expect(providers[0].uuid).toBe(PROVIDER.uuid);
		});

		it('deduplicates providers by uuid', async () => {
			const mockWindow = createMockWindow();
			// Override to announce same provider twice
			mockWindow.dispatchEvent = vi.fn((event: any) => {
				if (event.type === 'icrc94:requestProvider') {
					const _announceListeners =
						(mockWindow as any)._listeners?.get('icrc94:announceProvider') ?? new Set();
					// Access listeners directly
					const listeners = new Map<string, Set<(event: any) => void>>();
					(mockWindow.addEventListener as any).mock.calls.forEach(
						([event, listener]: [string, (event: any) => void]) => {
							if (!listeners.has(event)) listeners.set(event, new Set());
							listeners.get(event)!.add(listener);
						},
					);
					listeners.get('icrc94:announceProvider')?.forEach((l) => {
						l({ detail: PROVIDER });
						l({ detail: PROVIDER });
					});
				}
			}) as any;

			const providers = await BrowserExtensionTransport.discover({
				window: mockWindow as any,
				discoveryDuration: 10,
			});

			expect(providers).toHaveLength(1);
		});

		it('returns empty when no extensions respond', async () => {
			const mockWindow = createMockWindow();
			mockWindow.dispatchEvent = vi.fn() as any; // No announcements

			const providers = await BrowserExtensionTransport.discover({
				window: mockWindow as any,
				discoveryDuration: 10,
			});

			expect(providers).toHaveLength(0);
		});
	});

	describe('findTransport', () => {
		it('finds transport by uuid', async () => {
			const mockWindow = createMockWindow();

			const transport = await BrowserExtensionTransport.findTransport({
				uuid: PROVIDER.uuid,
				window: mockWindow as any,
				discoveryDuration: 10,
			});

			expect(transport).toBeInstanceOf(BrowserExtensionTransport);
		});

		it('throws when uuid not found', async () => {
			const mockWindow = createMockWindow();

			await expect(
				BrowserExtensionTransport.findTransport({
					uuid: 'nonexistent-uuid',
					window: mockWindow as any,
					discoveryDuration: 10,
				}),
			).rejects.toThrow(BrowserExtensionTransportError);
		});
	});

	describe('establishChannel', () => {
		it('returns a BrowserExtensionChannel', async () => {
			const mockWindow = createMockWindow();

			const transport = await BrowserExtensionTransport.findTransport({
				uuid: PROVIDER.uuid,
				window: mockWindow as any,
				discoveryDuration: 10,
			});

			const channel = await transport.establishChannel();

			expect(channel).toBeDefined();
			expect(channel.closed).toBe(false);
		});
	});
});
