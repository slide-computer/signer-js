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
export const UNKNOWN_ERROR = 10001;
export const VERSION_NOT_SUPPORTED_ERROR = 20101;
export const PERMISSION_NOT_GRANTED_ERROR = 30101;
export const ACTION_ABORTED_ERROR = 30201;
export const NETWORK_ERROR = 40001;
export const isGeneralError = (error: number) =>
  error >= 10000 && error <= 19999;
export const isNotSupportedError = (error: number) =>
  error >= 20000 && error <= 29999;
export const isUserActionError = (error: number) =>
  error >= 30000 && error <= 39999;
export const isNetworkError = (error: number) =>
  error >= 40000 && error <= 49999;
