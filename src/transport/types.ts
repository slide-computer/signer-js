import { JsonArray, JsonObject, JsonValue } from "@dfinity/candid";

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

export interface Transport {
  registerListener(
    listener: (response: JsonResponse) => Promise<void>,
  ): Promise<() => void>;

  send(requests: JsonRequest): Promise<void>;
}

export interface BatchTransport extends Transport {
  execute(): Promise<void>;
}
