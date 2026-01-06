import {
  type CallCanisterRequest,
  type Channel,
  type DelegationRequest,
  INVALID_REQUEST_ERROR,
  isJsonRpcRequest,
  type JsonRequest,
  type JsonResponse,
  NOT_SUPPORTED_ERROR,
} from "@slide-computer/signer";
import { StoicTransportError } from "./stoicTransport.js";
import { scopes, supportedStandards } from "./constants.js";
import { DelegationChain, DelegationIdentity } from "@icp-sdk/core/identity";
import type { StoicConnection } from "./stoicConnection.js";
import {
  Cbor,
  HttpAgent,
  polling,
  type SignIdentity,
} from "@icp-sdk/core/agent";
import { Principal } from "@icp-sdk/core/principal";

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
                subaccount: new Uint8Array(buffer).toBase64(),
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
          {
            toDer: () =>
              Uint8Array.fromBase64(delegationRequest.params!.publicKey),
          },
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
            publicKey: signedDelegationChain.publicKey.toBase64(),
            signerDelegation: signedDelegationChain.delegations.map(
              ({ delegation, signature }) => ({
                delegation: {
                  pubkey: delegation.pubkey.toBase64(),
                  expiration: delegation.expiration.toString(),
                  ...(delegation.targets
                    ? {
                        targets: delegation.targets.map((target) =>
                          target.toText(),
                        ),
                      }
                    : {}),
                },
                signature: signature.toBase64(),
              }),
            ),
          },
        };
      case "icrc49_call_canister":
        const callCanisterRequest = request as CallCanisterRequest;
        const { pollForResponse } = polling;
        const canisterId = Principal.fromText(
          callCanisterRequest.params!.canisterId,
        );
        const delegationIdentity = DelegationIdentity.fromDelegation(
          this.#connection.identity,
          this.#connection.delegationChain!,
        );
        if (
          callCanisterRequest.params?.sender !==
          delegationIdentity.getPrincipal().toString()
        ) {
          throw new StoicTransportError("Sender does not match Stoic identity");
        }
        const agent = await HttpAgent.from(
          this.#agent ?? (await HttpAgent.create()),
        );
        agent.replaceIdentity(delegationIdentity);
        let contentMap: Uint8Array;
        agent.addTransform("update", async (agentRequest) => {
          contentMap = Cbor.encode(agentRequest.body);
          return agentRequest;
        });
        const submitResponse = await agent.call(canisterId, {
          effectiveCanisterId: canisterId,
          methodName: callCanisterRequest.params!.method,
          arg: Uint8Array.fromBase64(callCanisterRequest.params!.arg),
        });
        await pollForResponse(agent, canisterId, submitResponse.requestId);
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
            contentMap: contentMap!.toBase64(),
            certificate: certificate.toBase64(),
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
