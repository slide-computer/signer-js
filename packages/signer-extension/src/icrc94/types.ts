import type { JsonRequest } from "@slide-computer/signer";

export interface ProviderDetail {
  /**
   * Globally unique identifier that must be UUIDv4 compliant
   */
  uuid: string;
  /**
   * Plain text name of the signer
   */
  name: string;
  /**
   * URI pointing to an image that must be a data URI scheme
   */
  icon: `data:image/${string}`;
  /**
   * Domain name in reverse syntax ordering
   */
  rdns: string;
  /**
   * Communication channel for relying party to send and receive JSON-RPC messages
   */
  sendMessage: (message: JsonRequest) => Promise<unknown>;
  /**
   * Dismiss the extension window
   */
  dismiss: () => Promise<void>;
}

export interface AnnounceProviderEvent extends CustomEvent<ProviderDetail> {
  type: "icrc94:announceProvider";
}

export interface RequestProviderEvent extends Event {
  type: "icrc94:requestProvider";
}

export interface UnexpectedlyClosedEvent extends Event {
  type: "icrc94:unexpectedlyClosed";
}
