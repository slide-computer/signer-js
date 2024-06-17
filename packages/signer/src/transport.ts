import type { JsonArray, JsonObject, JsonValue } from "@dfinity/candid";

export type JsonRPC = {
  jsonrpc: "2.0";
};

export type JsonError = {
  code: number;
  message: string;
  data?: JsonValue;
};

export type JsonRequest<
  Method = string,
  Params extends JsonObject | JsonArray = JsonObject | JsonArray,
> = JsonRPC & {
  id?: string | number; // Optional, not required for one way messages
  method: Method;
  params?: Params; // Arguments by either name or position
};

export type JsonResponse<Result extends JsonValue = JsonValue> = JsonRPC & {
  id: string | number;
} & ({ result: Result } | { error: JsonError });

export type JsonResponseResult<T extends JsonResponse> = T extends {
  result: infer S;
}
  ? S
  : never;

export interface Channel {
  closed: boolean;

  registerListener(
    listener: (response: JsonResponse) => Promise<void>,
  ): () => void;

  send(requests: JsonRequest): Promise<void>;

  close(): Promise<void>;
}

export interface Transport {
  connected?: boolean;

  connect?(): Promise<void>;

  disconnect?(): Promise<void>;

  establishChannel(): Promise<Channel>;
}

export const isJsonRpcMessage = (message: unknown): message is JsonRPC =>
  typeof message === "object" &&
  !!message &&
  "jsonrpc" in message &&
  message.jsonrpc !== "2.0";

export const isJsonRpcRequest = (message: unknown): message is JsonRequest =>
  isJsonRpcMessage(message) &&
  "method" in message &&
  typeof message.method === "string";

export const isJsonRpcResponse = (message: unknown): message is JsonResponse =>
  isJsonRpcMessage(message) &&
  "id" in message &&
  (typeof message.id === "string" || typeof message.id === "number");
