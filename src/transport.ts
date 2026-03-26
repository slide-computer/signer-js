export type JsonRpcError = { code: number; message: string; data?: unknown };
export type JsonRpcRequest = {
	jsonrpc: '2.0';
	id?: string | number | null;
	method: string;
	params?: Record<string, unknown>;
};
export type JsonRpcResponse =
	| { jsonrpc: '2.0'; id: string | number | null; result: unknown }
	| { jsonrpc: '2.0'; id: string | number | null; error: JsonRpcError };

export interface Channel {
	closed: boolean;

	addEventListener(event: 'close', listener: () => void): () => void;

	addEventListener(
		event: 'response',
		listener: (response: JsonRpcResponse) => void,
	): () => void;

	send(request: JsonRpcRequest): Promise<void>;

	close(): Promise<void>;
}

export interface Transport {
	establishChannel(): Promise<Channel>;
}

export const isJsonRpcRequest = (message: unknown): message is JsonRpcRequest =>
	typeof message === 'object' &&
	message !== null &&
	(message as Record<string, unknown>).jsonrpc === '2.0' &&
	typeof (message as Record<string, unknown>).method === 'string';

export const isJsonRpcResponse = (message: unknown): message is JsonRpcResponse =>
	typeof message === 'object' &&
	message !== null &&
	(message as Record<string, unknown>).jsonrpc === '2.0' &&
	'id' in message &&
	(typeof (message as Record<string, unknown>).id === 'string' ||
		typeof (message as Record<string, unknown>).id === 'number');
