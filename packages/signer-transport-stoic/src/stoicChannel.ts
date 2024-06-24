import {
  type CallCanisterRequest,
  type Channel,
  type DelegationRequest,
  fromBase64,
  INVALID_REQUEST_ERROR,
  isJsonRpcRequest,
  type JsonRequest,
  type JsonResponse,
  NOT_SUPPORTED_ERROR,
  toBase64,
} from "@slide-computer/signer";
import { StoicTransportError } from "./stoicTransport";
import { scopes, supportedStandards } from "./constants";
import { DelegationChain, DelegationIdentity } from "@dfinity/identity";
import type { StoicConnection } from "./stoicConnection";
import { Cbor, HttpAgent, polling, type SignIdentity } from "@dfinity/agent";
import { Principal } from "@dfinity/principal";

export class StoicChannel implements Channel {
  readonly #connection: StoicConnection;
  readonly #agent?: HttpAgent;
  readonly #closeListeners = new Set<() => void>();
  readonly #responseListeners = new Set<(response: JsonResponse) => void>();
  #closed: boolean = false;

  constructor(connection: StoicConnection, agent?: HttpAgent) {
    this.#connection = connection;
    this.#agent = agent;

    this.#connection.addEventListener(
      "disconnect",
      () => (this.#closed = true),
    );
  }

  get closed() {
    return this.#closed || !this.#connection.connected;
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
      throw new StoicTransportError("Communication channel is closed");
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
      case "icrc27_accounts":
        const owner = Principal.selfAuthenticating(
          new Uint8Array(this.#connection.delegationChain!.publicKey),
        ).toText();
        return {
          id,
          jsonrpc: "2.0",
          result: {
            accounts: Array.from({
              length: this.#connection.accounts ?? 0,
            }).map((_, index) => {
              const buffer = new ArrayBuffer(32);
              new DataView(buffer).setBigUint64(24, BigInt(index), false);
              return {
                owner,
                subaccount: toBase64(buffer),
              };
            }),
          },
        };
      case "icrc34_delegation":
        const delegationRequest = request as DelegationRequest;
        const identity = this.#connection.identity as SignIdentity;
        const delegationChain = this.#connection.delegationChain!;
        const expiration = new Date(
          Date.now() +
            Number(
              delegationRequest.params!.maxTimeToLive
                ? BigInt(delegationRequest.params!.maxTimeToLive) /
                    BigInt(1_000_000)
                : BigInt(8) * BigInt(3_600_000),
            ),
        );
        const signedDelegationChain = await DelegationChain.create(
          identity,
          { toDer: () => fromBase64(delegationRequest.params!.publicKey) },
          expiration,
          {
            previous: delegationChain,
            targets: delegationRequest.params!.targets?.map((target) =>
              Principal.fromText(target),
            ),
          },
        );
        return {
          id,
          jsonrpc: "2.0",
          result: {
            publicKey: toBase64(signedDelegationChain.publicKey),
            signerDelegation: signedDelegationChain.delegations.map(
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
      case "icrc49_call_canister":
        const callCanisterRequest = request as CallCanisterRequest;
        const { pollForResponse, defaultStrategy } = polling;
        const canisterId = Principal.fromText(
          callCanisterRequest.params!.canisterId,
        );
        const agent = new HttpAgent({
          source: this.#agent,
          identity: DelegationIdentity.fromDelegation(
            this.#connection.identity,
            this.#connection.delegationChain!,
          ),
        });
        let contentMap: ArrayBuffer;
        agent.addTransform("update", async (agentRequest) => {
          contentMap = Cbor.encode(agentRequest.body);
          return agentRequest;
        });
        const submitResponse = await agent.call(canisterId, {
          effectiveCanisterId: canisterId,
          methodName: callCanisterRequest.params!.method,
          arg: fromBase64(callCanisterRequest.params!.arg),
        });
        await pollForResponse(
          agent,
          canisterId,
          submitResponse.requestId,
          defaultStrategy(),
        );
        const { certificate } = await agent.readState(canisterId, {
          paths: [
            [
              new TextEncoder().encode("request_status"),
              submitResponse.requestId,
            ],
          ],
        });
        return {
          id,
          jsonrpc: "2.0",
          result: {
            contentMap: toBase64(contentMap!),
            certificate: toBase64(certificate),
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
