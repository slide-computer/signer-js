import type { JsonArray, JsonObject, JsonValue } from "@icp-sdk/core/candid";

export type JsonRpcError = {
  code: number;
  message: string;
  data?: JsonValue;
};

export type JsonRpcRequest<
  Method = string,
  Params extends JsonObject | JsonArray = JsonObject | JsonArray,
> = {
  jsonrpc: "2.0";
  id?: string | number;
  method: Method;
  params?: Params;
};

export type JsonRpcResponse<Result extends JsonValue = JsonValue> = {
  jsonrpc: "2.0";
  id: string | number;
} & ({ result: Result } | { error: JsonRpcError });

export interface Channel {
  closed: boolean;

  addEventListener(event: "close", listener: () => void): () => void;

  addEventListener(
    event: "response",
    listener: (response: JsonRpcResponse) => void,
  ): () => void;

  send(request: JsonRpcRequest): Promise<void>;

  close(): Promise<void>;
}

export interface Transport {
  establishChannel(): Promise<Channel>;
}

export const isJsonRpcRequest = (message: unknown): message is JsonRpcRequest =>
  typeof message === "object" &&
  !!message &&
  "jsonrpc" in message &&
  message.jsonrpc === "2.0" &&
  "method" in message &&
  typeof message.method === "string";

export const isJsonRpcResponse = (
  message: unknown,
): message is JsonRpcResponse =>
  typeof message === "object" &&
  !!message &&
  "jsonrpc" in message &&
  message.jsonrpc === "2.0" &&
  "id" in message &&
  (typeof message.id === "string" || typeof message.id === "number");
