import type { AuthClient } from "@dfinity/auth-client";
import {
  type Channel,
  type Connection,
  type JsonRequest,
  type JsonResponse,
  NOT_SUPPORTED_ERROR,
} from "@slide-computer/signer";
import { AuthClientTransportError } from "./authClientTransport";
import { scopes, supportedStandards } from "./constants";
import type { DelegationIdentity } from "@dfinity/identity";
import { Buffer } from "buffer";

export interface AuthClientChannelOptions {
  /**
   * AuthClient instance from "@dfinity/auth-client"
   */
  authClient: AuthClient;
  /**
   * AuthClientTransport connection, used to close channel once connection is closed
   */
  connection: Connection;
}

export class AuthClientChannel implements Channel {
  #options: Required<AuthClientChannelOptions>;
  #closed: boolean = false;
  #closeListeners = new Set<() => void>();
  #responseListeners = new Set<(response: JsonResponse) => void>();

  constructor(options: AuthClientChannelOptions) {
    this.#options = options;
    this.#options.connection.addEventListener(
      "disconnect",
      () => (this.#closed = true),
    );
  }

  get closed() {
    return this.#closed || !this.#options.connection.connected;
  }

  addEventListener(
    ...[event, listener]:
      | [event: "close", listener: () => void]
      | [event: "response", listener: (response: JsonResponse) => void]
  ): () => void {
    switch (event) {
      case "close":
        this.#closeListeners.add(listener);
        return () => {
          this.#closeListeners.delete(listener);
        };
      case "response":
        this.#responseListeners.add(listener);
        return () => {
          this.#responseListeners.delete(listener);
        };
    }
  }

  async send(request: JsonRequest): Promise<void> {
    if (this.closed) {
      throw new AuthClientTransportError("Communication channel is closed");
    }

    // Ignore one way messages
    if (request.id === undefined) {
      return;
    }

    // Create response and call listeners
    const response = this.#createResponse(request);
    this.#responseListeners.forEach((listener) => listener(response));
  }

  async close(): Promise<void> {}

  #createResponse(request: JsonRequest): JsonResponse {
    if (request.id === undefined) {
      throw new AuthClientTransportError("Request is missing id");
    }

    switch (request.method) {
      case "icrc25_supported_standards":
        return {
          id: request.id,
          jsonrpc: "2.0",
          result: { supportedStandards },
        };
      case "icrc25_permissions":
      case "icrc25_request_permissions":
        return {
          id: request.id,
          jsonrpc: "2.0",
          result: { scopes },
        };
      case "icrc34_delegation":
        const identity =
          this.#options.authClient.getIdentity() as DelegationIdentity;
        const delegation = identity.getDelegation();
        return {
          id: request.id,
          jsonrpc: "2.0",
          result: {
            publicKey: Buffer.from(delegation.publicKey).toString("base64"),
            signerDelegation: delegation.delegations.map(
              ({ delegation, signature }) => ({
                delegation: {
                  pubkey: Buffer.from(delegation.pubkey).toString("base64"),
                  expiration: delegation.expiration.toString(),
                  ...(delegation.targets
                    ? {
                        targets: delegation.targets.map((target) =>
                          target.toText(),
                        ),
                      }
                    : {}),
                },
                signature: Buffer.from(signature).toString("base64"),
              }),
            ),
          },
        };
      default:
        return {
          id: request.id,
          jsonrpc: "2.0",
          error: { code: NOT_SUPPORTED_ERROR, message: "Not supported" },
        };
    }
  }
}
