// JSON RPC errors
export const JSON_PARSE_ERROR = -32700;
export const INVALID_REQUEST_ERROR = -32600;
export const METHOD_NOT_FOUND_ERROR = -32601;
export const INVALID_PARAMS_ERROR = -32602;
export const INTERNAL_ERROR = -32603;
export const isServerError = (error: number) =>
  error >= -32099 && error <= -32000;
export const isJsonRpcError = (error: number) =>
  error >= -32768 && error <= -32000;

// ICRC-25 errors
export const GENERIC_ERROR = 1000;
export const NOT_SUPPORTED_ERROR = 2000;
export const PERMISSION_NOT_GRANTED_ERROR = 3000;
export const ACTION_ABORTED_ERROR = 3001;
export const NETWORK_ERROR = 4000;
export const isGeneralError = (error: number) => error >= 1000 && error <= 1999;
export const isNotSupportedError = (error: number) =>
  error >= 2000 && error <= 2999;
export const isUserActionError = (error: number) =>
  error >= 3000 && error <= 3999;
export const isNetworkError = (error: number) => error >= 4000 && error <= 4999;
