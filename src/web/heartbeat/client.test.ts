import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeartbeatClient } from './client.js';

const ORIGIN = 'https://signer.example.com';

let idCounter = 0;
const mockCrypto = { randomUUID: () => `hb-${++idCounter}` } as Pick<Crypto, 'randomUUID'>;

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
		dispatch: (event: { type: string; [key: string]: any }) => {
			listeners.get(event.type)?.forEach((l) => l(event));
		},
	};
};

beforeEach(() => {
	idCounter = 0;
	vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
	vi.useRealTimers();
});

describe('HeartbeatClient', () => {
	it('calls onEstablish when signer responds to status request', async () => {
		const relyingPartyWindow = createMockWindow();
		const onEstablish = vi.fn();
		const onEstablishTimeout = vi.fn();

		const signerWindow = {
			postMessage: vi.fn((data: any, _target: string) => {
				if (data?.method === 'icrc29_status') {
					queueMicrotask(() => {
						relyingPartyWindow.dispatch({
							type: 'message',
							data: { jsonrpc: '2.0', id: data.id, result: 'ready' },
							origin: ORIGIN,
							source: signerWindow,
						});
					});
				}
			}),
		};

		new HeartbeatClient({
			signerWindow: signerWindow as any,
			window: relyingPartyWindow as any,
			crypto: mockCrypto,
			onEstablish,
			onEstablishTimeout,
			onDisconnect: vi.fn(),
			onStatusChange: vi.fn(),
			onPendingTimeout: vi.fn(),
			statusPollingRate: 10,
			establishTimeout: 1000,
		});

		await vi.advanceTimersByTimeAsync(50);

		expect(onEstablish).toHaveBeenCalledWith(ORIGIN, 'ready');
		expect(onEstablishTimeout).not.toHaveBeenCalled();
	});

	it('calls onEstablishTimeout when signer does not respond', async () => {
		const relyingPartyWindow = createMockWindow();
		const onEstablish = vi.fn();
		const onEstablishTimeout = vi.fn();

		const signerWindow = { postMessage: vi.fn() };

		new HeartbeatClient({
			signerWindow: signerWindow as any,
			window: relyingPartyWindow as any,
			crypto: mockCrypto,
			onEstablish,
			onEstablishTimeout,
			onDisconnect: vi.fn(),
			onStatusChange: vi.fn(),
			onPendingTimeout: vi.fn(),
			statusPollingRate: 10,
			establishTimeout: 50,
		});

		await vi.advanceTimersByTimeAsync(100);

		expect(onEstablishTimeout).toHaveBeenCalled();
		expect(onEstablish).not.toHaveBeenCalled();
	});

	it('establishes with pending status', async () => {
		const relyingPartyWindow = createMockWindow();
		const onEstablish = vi.fn();

		const signerWindow = {
			postMessage: vi.fn((data: any) => {
				if (data?.method === 'icrc29_status') {
					queueMicrotask(() => {
						relyingPartyWindow.dispatch({
							type: 'message',
							data: { jsonrpc: '2.0', id: data.id, result: 'pending' },
							origin: ORIGIN,
							source: signerWindow,
						});
					});
				}
			}),
		};

		new HeartbeatClient({
			signerWindow: signerWindow as any,
			window: relyingPartyWindow as any,
			crypto: mockCrypto,
			onEstablish,
			onEstablishTimeout: vi.fn(),
			onDisconnect: vi.fn(),
			onStatusChange: vi.fn(),
			onPendingTimeout: vi.fn(),
			statusPollingRate: 10,
			establishTimeout: 1000,
		});

		await vi.advanceTimersByTimeAsync(50);

		expect(onEstablish).toHaveBeenCalledWith(ORIGIN, 'pending');
	});
});
