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
    listener: (responses: JsonResponse[]) => Promise<void>,
  ): Promise<() => void>;

  send(requests: JsonRequest[]): Promise<void>;
}

export type PermissionJsonRequest = JsonRequest<{
  version: 1;
  appMetaData: {
    name: string;
    icon?: string;
  };
  networks: Array<{
    chainId: string;
    name?: string;
  }>;
  scopes: Array<"canister_call" | "delegation">;
  challenge: string;
  publicKey?: string;
  targets?: string[];
}>;

export type PermissionJsonResponse = JsonResponse<{
  version: 1;
  appMetaData: {
    name: string;
    icon?: string;
  };
  scopes: Array<"canister_call" | "delegation">;
  identities: Array<{
    publicKey: string;
    signature: string;
    delegationChain?: Array<{
      signature: string;
      delegation: {
        publicKey: string;
        expiration: string;
        targets?: string[];
      };
    }>;
    ledger?: {
      subaccounts?: Array<{
        bytes: string;
        name?: string;
      }>;
    };
  }>;
}>;

export type CanisterCallJsonRequest = JsonRequest<{
  version: 1;
  network: {
    chainId: string;
    name?: string;
    rpcUrl?: string;
  };
  canisterId: string;
  sender: string;
  method: string;
  arg: string;
  publicKey?: string;
  signature?: string;
}>;

export type CanisterCallJsonResponse = JsonResponse<{
  version: 1;
  network: {
    chainId: string;
    name?: string;
    rpcUrl?: string;
  };
  contentMap: {
    request_type: string;
    sender: string;
    nonce?: string;
    ingress_expiry: string;
    canister_id: string;
    method_name: string;
    arg: string;
  };
  certificate: string;
}>;
