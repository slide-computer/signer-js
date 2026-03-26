import { describe, expect, it, vi } from 'vitest';
import { PostMessageChannel } from './postMessageChannel.js';
import { PostMessageTransportError } from './postMessageTransport.js';

const SIGNER_ORIGIN = 'https://signer.example.com';

const createMockSignerWindow = () => ({
	postMessage: vi.fn(),
	close: vi.fn(),
	focus: vi.fn(),
});

const createMockWindow = () => {
	const listeners = new Map<string, Set<(event: any) => void>>();
	return {
		addEventListener: (event: string, listener: (event: any) => void) => {
			if (!listeners.has(event)) listeners.set(event, new Set());
			listeners.get(event)!.add(listener);
		},
		removeEventListener: (event: string, listener: (event: any) => void) => {
			listeners.get(event)?.delete(listener);
		},
		dispatch: (event: { type: string; [key: string]: any }) => {
			listeners.get(event.type)?.forEach((l) => l(event));
		},
		focus: vi.fn(),
	};
};

const createChannel = (
	overrides: { signerStatus?: 'pending' | 'ready'; manageFocus?: boolean } = {},
) => {
	const signerWindow = createMockSignerWindow();
	const window = createMockWindow();
	const channel = new PostMessageChannel({
		signerWindow: signerWindow as any,
		signerOrigin: SIGNER_ORIGIN,
		window: window as any,
		signerStatus: overrides.signerStatus ?? 'ready',
		manageFocus: overrides.manageFocus ?? false,
	});
	return { channel, signerWindow, window };
};

describe('PostMessageChannel', () => {
	describe('send', () => {
		it('posts message to signer window', async () => {
			const { channel, signerWindow } = createChannel();
			const request = { jsonrpc: '2.0' as const, id: 1, method: 'test' };

			await channel.send(request);

			expect(signerWindow.postMessage).toHaveBeenCalledWith(request, SIGNER_ORIGIN);
		});

		it('focuses signer window when manageFocus is true', async () => {
			const { channel, signerWindow } = createChannel({ manageFocus: true });

			await channel.send({ jsonrpc: '2.0', id: 1, method: 'test' });

			expect(signerWindow.focus).toHaveBeenCalled();
		});

		it('does not focus signer window when manageFocus is false', async () => {
			const { channel, signerWindow } = createChannel({ manageFocus: false });

			await channel.send({ jsonrpc: '2.0', id: 1, method: 'test' });

			expect(signerWindow.focus).not.toHaveBeenCalled();
		});

		it('throws when channel is closed', async () => {
			const { channel } = createChannel();
			await channel.close();

			await expect(channel.send({ jsonrpc: '2.0', id: 1, method: 'test' })).rejects.toThrow(
				PostMessageTransportError,
			);
		});

		it('queues messages when status is pending', async () => {
			const { channel, signerWindow } = createChannel({
				signerStatus: 'pending',
			});

			await channel.send({ jsonrpc: '2.0', id: 1, method: 'test' });

			expect(signerWindow.postMessage).not.toHaveBeenCalled();
		});

		it('flushes queued messages when status changes to ready', async () => {
			const { channel, signerWindow } = createChannel({
				signerStatus: 'pending',
			});
			const request1 = { jsonrpc: '2.0' as const, id: 1, method: 'test1' };
			const request2 = { jsonrpc: '2.0' as const, id: 2, method: 'test2' };

			await channel.send(request1);
			await channel.send(request2);
			expect(signerWindow.postMessage).not.toHaveBeenCalled();

			channel.changeStatus('ready');

			expect(signerWindow.postMessage).toHaveBeenCalledTimes(2);
			expect(signerWindow.postMessage).toHaveBeenCalledWith(request1, SIGNER_ORIGIN);
			expect(signerWindow.postMessage).toHaveBeenCalledWith(request2, SIGNER_ORIGIN);
		});
	});

	describe('close', () => {
		it('closes signer window and notifies listeners', async () => {
			const { channel, signerWindow } = createChannel();
			const closeListener = vi.fn();
			channel.addEventListener('close', closeListener);

			await channel.close();

			expect(channel.closed).toBe(true);
			expect(signerWindow.close).toHaveBeenCalled();
			expect(closeListener).toHaveBeenCalled();
		});

		it('focuses relying party window when manageFocus is true', async () => {
			const { channel, window } = createChannel({ manageFocus: true });

			await channel.close();

			expect(window.focus).toHaveBeenCalled();
		});

		it('is idempotent', async () => {
			const { channel, signerWindow } = createChannel();

			await channel.close();
			await channel.close();

			expect(signerWindow.close).toHaveBeenCalledTimes(1);
		});
	});

	describe('addEventListener', () => {
		it('receives responses matching source and origin', () => {
			const { channel, signerWindow, window } = createChannel();
			const listener = vi.fn();
			channel.addEventListener('response', listener);

			window.dispatch({
				type: 'message',
				data: { jsonrpc: '2.0', id: 1, result: 'ok' },
				origin: SIGNER_ORIGIN,
				source: signerWindow,
			});

			expect(listener).toHaveBeenCalledWith({
				jsonrpc: '2.0',
				id: 1,
				result: 'ok',
			});
		});

		it('ignores messages from wrong origin', () => {
			const { channel, signerWindow, window } = createChannel();
			const listener = vi.fn();
			channel.addEventListener('response', listener);

			window.dispatch({
				type: 'message',
				data: { jsonrpc: '2.0', id: 1, result: 'ok' },
				origin: 'https://evil.com',
				source: signerWindow,
			});

			expect(listener).not.toHaveBeenCalled();
		});

		it('ignores messages from wrong source', () => {
			const { channel, window } = createChannel();
			const listener = vi.fn();
			channel.addEventListener('response', listener);

			window.dispatch({
				type: 'message',
				data: { jsonrpc: '2.0', id: 1, result: 'ok' },
				origin: SIGNER_ORIGIN,
				source: {}, // wrong source
			});

			expect(listener).not.toHaveBeenCalled();
		});

		it('ignores non-JSON-RPC messages', () => {
			const { channel, signerWindow, window } = createChannel();
			const listener = vi.fn();
			channel.addEventListener('response', listener);

			window.dispatch({
				type: 'message',
				data: { some: 'random data' },
				origin: SIGNER_ORIGIN,
				source: signerWindow,
			});

			expect(listener).not.toHaveBeenCalled();
		});

		it('unsubscribes response listener', () => {
			const { channel, signerWindow, window } = createChannel();
			const listener = vi.fn();
			const unsubscribe = channel.addEventListener('response', listener);

			unsubscribe();

			window.dispatch({
				type: 'message',
				data: { jsonrpc: '2.0', id: 1, result: 'ok' },
				origin: SIGNER_ORIGIN,
				source: signerWindow,
			});

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
});
