import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostMessageTransport, PostMessageTransportError } from './postMessageTransport.js';

// Creates a mock Window that simulates the relying party window.
// It supports addEventListener/removeEventListener for "message" events,
// open() to create a mock signer window, and focus().
const createMockWindow = () => {
	const listeners = new Map<string, Set<(event: any) => void>>();

	const addEventListener = (event: string, listener: (event: any) => void) => {
		if (!listeners.has(event)) listeners.set(event, new Set());
		listeners.get(event)!.add(listener);
	};

	const removeEventListener = (event: string, listener: (event: any) => void) => {
		listeners.get(event)?.delete(listener);
	};

	const dispatchEvent = (event: { type: string; [key: string]: any }) => {
		listeners.get(event.type)?.forEach((l) => l(event));
	};

	return {
		addEventListener,
		removeEventListener,
		dispatchEvent,
		focus: vi.fn(),
		open: vi.fn(),
		opener: null,
	} as unknown as Window & { dispatchEvent: (event: any) => void };
};

// Creates a mock signer window that auto-responds to icrc29_status heartbeat
// requests by dispatching a response on the relying party window.
const createMockSignerWindow = (
	relyingPartyWindow: Window & { dispatchEvent: (event: any) => void },
	origin: string,
	status: 'pending' | 'ready' = 'ready',
) => {
	const signerWindow = {
		postMessage: vi.fn((data: any, _targetOrigin: string) => {
			// Auto-respond to heartbeat status requests
			if (data?.method === 'icrc29_status' && data?.id) {
				queueMicrotask(() => {
					relyingPartyWindow.dispatchEvent({
						type: 'message',
						data: { jsonrpc: '2.0', id: data.id, result: status },
						origin,
						source: signerWindow,
					});
				});
			}
		}),
		close: vi.fn(),
		focus: vi.fn(),
		closed: false,
	};
	return signerWindow;
};

let idCounter = 0;
const mockCrypto = { randomUUID: () => `heartbeat-${++idCounter}` } as Pick<Crypto, 'randomUUID'>;

beforeEach(() => {
	idCounter = 0;
	vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
	vi.useRealTimers();
});

describe('PostMessageTransport', () => {
	describe('constructor', () => {
		it('rejects non-secure URLs', () => {
			expect(() => new PostMessageTransport({ url: 'http://example.com' })).toThrow(
				PostMessageTransportError,
			);
		});

		it('accepts https URLs', () => {
			expect(
				() =>
					new PostMessageTransport({
						url: 'https://signer.example.com',
						detectNonClickEstablishment: false,
					}),
			).not.toThrow();
		});

		it('accepts localhost URLs', () => {
			expect(
				() =>
					new PostMessageTransport({
						url: 'http://localhost:3000',
						detectNonClickEstablishment: false,
					}),
			).not.toThrow();
		});

		it('accepts 127.0.0.1 URLs', () => {
			expect(
				() =>
					new PostMessageTransport({
						url: 'http://127.0.0.1:8080',
						detectNonClickEstablishment: false,
					}),
			).not.toThrow();
		});
	});

	describe('establishChannel', () => {
		it('throws when opened outside click handler with detection enabled', async () => {
			const mockWindow = createMockWindow();
			const transport = new PostMessageTransport({
				url: 'https://signer.example.com',
				window: mockWindow,
				detectNonClickEstablishment: true,
			});

			await expect(transport.establishChannel()).rejects.toThrow(
				'Signer window should not be opened outside of click handler',
			);
		});

		it('opens a signer window and establishes a channel', async () => {
			const mockWindow = createMockWindow();
			const signerOrigin = 'https://signer.example.com';
			const signerWindow = createMockSignerWindow(mockWindow, signerOrigin);
			mockWindow.open = vi.fn(() => signerWindow) as any;

			const transport = new PostMessageTransport({
				url: `${signerOrigin}/sign`,
				window: mockWindow,
				crypto: mockCrypto,
				detectNonClickEstablishment: false,
				statusPollingRate: 10,
				establishTimeout: 1000,
			});

			const channel = await transport.establishChannel();

			expect(mockWindow.open).toHaveBeenCalled();
			expect(channel).toBeDefined();
			expect(channel.closed).toBe(false);
		});

		it('throws when window.open returns null', async () => {
			const mockWindow = createMockWindow();
			mockWindow.open = vi.fn(() => null) as any;

			const transport = new PostMessageTransport({
				url: 'https://signer.example.com/sign',
				window: mockWindow,
				detectNonClickEstablishment: false,
			});

			await expect(transport.establishChannel()).rejects.toThrow(
				'Signer window could not be opened',
			);
		});

		it('times out when signer does not respond', async () => {
			const mockWindow = createMockWindow();
			const signerWindow = {
				postMessage: vi.fn(),
				close: vi.fn(),
				focus: vi.fn(),
				closed: false,
			};
			mockWindow.open = vi.fn(() => signerWindow) as any;

			const transport = new PostMessageTransport({
				url: 'https://signer.example.com/sign',
				window: mockWindow,
				crypto: mockCrypto,
				detectNonClickEstablishment: false,
				statusPollingRate: 10,
				establishTimeout: 50,
			});

			await expect(transport.establishChannel()).rejects.toThrow(
				'Communication channel could not be established within a reasonable time',
			);
		});

		it('closes signer window on establish timeout when configured', async () => {
			const mockWindow = createMockWindow();
			const signerWindow = {
				postMessage: vi.fn(),
				close: vi.fn(),
				focus: vi.fn(),
				closed: false,
			};
			mockWindow.open = vi.fn(() => signerWindow) as any;

			const transport = new PostMessageTransport({
				url: 'https://signer.example.com/sign',
				window: mockWindow,
				crypto: mockCrypto,
				detectNonClickEstablishment: false,
				statusPollingRate: 10,
				establishTimeout: 50,
				closeOnEstablishTimeout: true,
			});

			await expect(transport.establishChannel()).rejects.toThrow();
			expect(signerWindow.close).toHaveBeenCalled();
		});

		it('does not close signer window on timeout when closeOnEstablishTimeout is false', async () => {
			const mockWindow = createMockWindow();
			const signerWindow = {
				postMessage: vi.fn(),
				close: vi.fn(),
				focus: vi.fn(),
				closed: false,
			};
			mockWindow.open = vi.fn(() => signerWindow) as any;

			const transport = new PostMessageTransport({
				url: 'https://signer.example.com/sign',
				window: mockWindow,
				crypto: mockCrypto,
				detectNonClickEstablishment: false,
				statusPollingRate: 10,
				establishTimeout: 50,
				closeOnEstablishTimeout: false,
			});

			await expect(transport.establishChannel()).rejects.toThrow();
			expect(signerWindow.close).not.toHaveBeenCalled();
		});

		it('establishes with pending status', async () => {
			const mockWindow = createMockWindow();
			const signerOrigin = 'https://signer.example.com';
			const signerWindow = createMockSignerWindow(mockWindow, signerOrigin, 'pending');
			mockWindow.open = vi.fn(() => signerWindow) as any;

			const transport = new PostMessageTransport({
				url: `${signerOrigin}/sign`,
				window: mockWindow,
				crypto: mockCrypto,
				detectNonClickEstablishment: false,
				statusPollingRate: 10,
				establishTimeout: 1000,
			});

			const channel = await transport.establishChannel();

			expect(channel).toBeDefined();
		});
	});
});
