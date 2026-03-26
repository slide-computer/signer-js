import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeartbeatServer } from './server.js';

const ORIGIN = 'https://signer.example.com';

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
		opener: null,
	};
};

beforeEach(() => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
	vi.useRealTimers();
});

describe('HeartbeatServer', () => {
	it('calls onEstablish when client sends status request', () => {
		const serverWindow = createMockWindow();
		const onEstablish = vi.fn();
		const mockSource = { postMessage: vi.fn() };

		new HeartbeatServer({
			window: serverWindow as any,
			onEstablish,
			onEstablishTimeout: vi.fn(),
			onDisconnect: vi.fn(),
			establishTimeout: 1000,
		});

		serverWindow.dispatch({
			type: 'message',
			data: { jsonrpc: '2.0', id: 'req-1', method: 'icrc29_status' },
			origin: ORIGIN,
			source: mockSource,
		});

		expect(onEstablish).toHaveBeenCalledWith(ORIGIN, mockSource);
		expect(mockSource.postMessage).toHaveBeenCalledWith(
			{ jsonrpc: '2.0', id: 'req-1', result: 'ready' },
			ORIGIN,
		);
	});

	it('calls onEstablishTimeout when no client connects', async () => {
		const serverWindow = createMockWindow();
		const onEstablishTimeout = vi.fn();

		new HeartbeatServer({
			window: serverWindow as any,
			onEstablish: vi.fn(),
			onEstablishTimeout,
			onDisconnect: vi.fn(),
			establishTimeout: 50,
		});

		await vi.advanceTimersByTimeAsync(100);

		expect(onEstablishTimeout).toHaveBeenCalled();
	});

	it('responds with pending status when configured', () => {
		const serverWindow = createMockWindow();
		const mockSource = { postMessage: vi.fn() };

		new HeartbeatServer({
			window: serverWindow as any,
			status: 'pending',
			onEstablish: vi.fn(),
			onEstablishTimeout: vi.fn(),
			onDisconnect: vi.fn(),
		});

		serverWindow.dispatch({
			type: 'message',
			data: { jsonrpc: '2.0', id: 'req-1', method: 'icrc29_status' },
			origin: ORIGIN,
			source: mockSource,
		});

		expect(mockSource.postMessage).toHaveBeenCalledWith(
			{ jsonrpc: '2.0', id: 'req-1', result: 'pending' },
			ORIGIN,
		);
	});

	it('changeStatus updates the response', () => {
		const serverWindow = createMockWindow();
		const mockSource = { postMessage: vi.fn() };

		const server = new HeartbeatServer({
			window: serverWindow as any,
			status: 'pending',
			onEstablish: vi.fn(),
			onEstablishTimeout: vi.fn(),
			onDisconnect: vi.fn(),
		});

		serverWindow.dispatch({
			type: 'message',
			data: { jsonrpc: '2.0', id: 'req-1', method: 'icrc29_status' },
			origin: ORIGIN,
			source: mockSource,
		});

		expect(mockSource.postMessage).toHaveBeenLastCalledWith(
			{ jsonrpc: '2.0', id: 'req-1', result: 'pending' },
			ORIGIN,
		);

		server.changeStatus('ready');

		serverWindow.dispatch({
			type: 'message',
			data: { jsonrpc: '2.0', id: 'req-2', method: 'icrc29_status' },
			origin: ORIGIN,
			source: mockSource,
		});

		expect(mockSource.postMessage).toHaveBeenLastCalledWith(
			{ jsonrpc: '2.0', id: 'req-2', result: 'ready' },
			ORIGIN,
		);
	});

	it('filters by allowedOrigin when set', () => {
		const serverWindow = createMockWindow();
		const onEstablish = vi.fn();

		new HeartbeatServer({
			window: serverWindow as any,
			allowedOrigin: 'https://trusted.example.com',
			onEstablish,
			onEstablishTimeout: vi.fn(),
			onDisconnect: vi.fn(),
		});

		serverWindow.dispatch({
			type: 'message',
			data: { jsonrpc: '2.0', id: 'req-1', method: 'icrc29_status' },
			origin: 'https://evil.com',
			source: { postMessage: vi.fn() },
		});

		expect(onEstablish).not.toHaveBeenCalled();

		serverWindow.dispatch({
			type: 'message',
			data: { jsonrpc: '2.0', id: 'req-2', method: 'icrc29_status' },
			origin: 'https://trusted.example.com',
			source: { postMessage: vi.fn() },
		});

		expect(onEstablish).toHaveBeenCalled();
	});

	it('calls onDisconnect when client stops sending', async () => {
		const serverWindow = createMockWindow();
		const onDisconnect = vi.fn();
		const mockSource = { postMessage: vi.fn() };

		new HeartbeatServer({
			window: serverWindow as any,
			onEstablish: vi.fn(),
			onEstablishTimeout: vi.fn(),
			onDisconnect,
			disconnectTimeout: 50,
		});

		serverWindow.dispatch({
			type: 'message',
			data: { jsonrpc: '2.0', id: 'req-1', method: 'icrc29_status' },
			origin: ORIGIN,
			source: mockSource,
		});

		await vi.advanceTimersByTimeAsync(100);

		expect(onDisconnect).toHaveBeenCalled();
	});

	it('ignores non-icrc29_status requests', () => {
		const serverWindow = createMockWindow();
		const onEstablish = vi.fn();

		new HeartbeatServer({
			window: serverWindow as any,
			onEstablish,
			onEstablishTimeout: vi.fn(),
			onDisconnect: vi.fn(),
		});

		serverWindow.dispatch({
			type: 'message',
			data: { jsonrpc: '2.0', id: 'req-1', method: 'icrc27_accounts' },
			origin: ORIGIN,
			source: { postMessage: vi.fn() },
		});

		expect(onEstablish).not.toHaveBeenCalled();
	});
});
