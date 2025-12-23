import type {
  AnnounceProviderEvent,
  RequestProviderEvent,
  UnexpectedlyClosedEvent,
} from "./types.js";

export {};

declare global {
  interface WindowEventMap {
    "icrc94:announceProvider": AnnounceProviderEvent;
    "icrc94:requestProvider": RequestProviderEvent;
    "icrc94:unexpectedlyClosed": UnexpectedlyClosedEvent;
  }
}
