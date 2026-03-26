import { z } from 'zod';

const zId = z.union([z.string(), z.number(), z.null()]);

export const JsonRpcErrorSchema = z.object({
	code: z.coerce.number().pipe(z.int()),
	message: z.coerce.string(),
	data: z.json().optional(),
});

export const JsonRpcRequestSchema = z.object({
	jsonrpc: z.literal('2.0'),
	id: zId.optional(),
	method: z.coerce.string(),
	params: z.union([z.array(z.json()), z.looseObject({})]).optional(),
});

export const JsonRpcResponseSchema = z.union([
	z.object({
		jsonrpc: z.literal('2.0'),
		id: zId,
		result: z.unknown(),
	}),
	z.object({
		jsonrpc: z.literal('2.0'),
		id: zId,
		error: JsonRpcErrorSchema,
	}),
]);

export type JsonRpcError = z.infer<typeof JsonRpcErrorSchema>;
export type JsonRpcRequest = z.infer<typeof JsonRpcRequestSchema>;
export type JsonRpcResponse = z.infer<typeof JsonRpcResponseSchema>;

export interface Channel {
	closed: boolean;

	addEventListener(event: 'close', listener: () => void): () => void;

	addEventListener(event: 'response', listener: (response: JsonRpcResponse) => void): () => void;

	send(request: JsonRpcRequest): Promise<void>;

	close(): Promise<void>;
}

export interface Transport {
	establishChannel(): Promise<Channel>;
}
