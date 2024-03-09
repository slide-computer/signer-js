import { JsonRequest, JsonResponse, JsonRPC } from "./types";

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
