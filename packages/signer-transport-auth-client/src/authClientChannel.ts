import type { AuthClient } from "@dfinity/auth-client";
import {
  type Channel,
  type Connection,
  type DelegationRequest,
  fromBase64,
  INVALID_REQUEST_ERROR,
  isJsonRpcRequest,
  type JsonRequest,
  type JsonResponse,
  NOT_SUPPORTED_ERROR,
  toBase64,
} from "@slide-computer/signer";
import { AuthClientTransportError } from "./authClientTransport";
import { scopes, supportedStandards } from "./constants";
import { DelegationChain, type DelegationIdentity } from "@dfinity/identity";
import { Principal } from "@dfinity/principal";

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
    const id = request.id;
    if (id === undefined) {
      return;
    }

    // Create response and call listeners
    const response = await this.#createResponse({ id, ...request });
    this.#responseListeners.forEach((listener) => listener(response));
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.#closeListeners.forEach((listener) => listener());
  }

  async #createResponse(
    request: JsonRequest & { id: NonNullable<JsonRequest["id"]> },
  ): Promise<JsonResponse> {
    const id = request.id;

    if (!isJsonRpcRequest(request)) {
      return {
        id,
        jsonrpc: "2.0",
        error: { code: INVALID_REQUEST_ERROR, message: "Invalid request" },
      };
    }

    switch (request.method) {
      case "icrc25_supported_standards":
        return {
          id,
          jsonrpc: "2.0",
          result: { supportedStandards },
        };
      case "icrc25_permissions":
      case "icrc25_request_permissions":
        return {
          id,
          jsonrpc: "2.0",
          result: { scopes },
        };
      case "icrc34_delegation":
        const delegationRequest = request as DelegationRequest;
        if (!delegationRequest.params) {
          throw new AuthClientTransportError(
            "Required params missing in request",
          );
        }
        const identity =
          this.#options.authClient.getIdentity() as DelegationIdentity;
        const publicKey = fromBase64(delegationRequest.params.publicKey);
        const expiration = delegationRequest.params.maxTimeToLive
          ? new Date(
              Date.now() +
                Number(
                  BigInt(delegationRequest.params.maxTimeToLive) /
                    BigInt(1_000_000),
                ),
            )
          : undefined;
        const delegation = await DelegationChain.create(
          identity,
          { toDer: () => publicKey },
          expiration,
          {
            previous: identity.getDelegation(),
            targets: delegationRequest.params.targets?.map((target) =>
              Principal.fromText(target),
            ),
          },
        );
        return {
          id,
          jsonrpc: "2.0",
          result: {
            publicKey: toBase64(delegation.publicKey),
            signerDelegation: delegation.delegations.map(
              ({ delegation, signature }) => ({
                delegation: {
                  pubkey: toBase64(delegation.pubkey),
                  expiration: delegation.expiration.toString(),
                  ...(delegation.targets
                    ? {
                        targets: delegation.targets.map((target) =>
                          target.toText(),
                        ),
                      }
                    : {}),
                },
                signature: toBase64(signature),
              }),
            ),
          },
        };
      default:
        return {
          id,
          jsonrpc: "2.0",
          error: { code: NOT_SUPPORTED_ERROR, message: "Not supported" },
        };
    }
  }
}
