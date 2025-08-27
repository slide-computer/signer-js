import {
  type BatchCallCanisterRequest,
  type BatchCallCanisterResponse,
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
import { AgentTransportError } from "./agentTransport";
import { scopes, supportedStandards } from "./constants";
import { DelegationChain, DelegationIdentity } from "@dfinity/identity";
import {
  Actor,
  Cbor,
  Certificate,
  HttpAgent,
  IC_ROOT_KEY,
  LookupStatus,
  polling,
  type SignIdentity,
} from "@dfinity/agent";
import { Principal } from "@dfinity/principal";
import { IDL } from "@dfinity/candid";

const ROOT_KEY = new Uint8Array(
  IC_ROOT_KEY.match(/[\da-f]{2}/gi)!.map((h) => parseInt(h, 16)),
).buffer;

export class AgentChannel implements Channel {
  readonly #agent: HttpAgent;
  readonly #closeListeners = new Set<() => void>();
  readonly #responseListeners = new Set<(response: JsonResponse) => void>();
  #closed: boolean = false;

  constructor(agent: HttpAgent) {
    this.#agent = agent;
  }

  get closed() {
    return this.#closed;
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
      throw new AgentTransportError("Communication channel is closed");
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
      case "icrc27_accounts": {
        const owner = (await this.#agent.getPrincipal()).toText();
        return {
          id,
          jsonrpc: "2.0",
          result: {
            accounts: [{ owner }],
          },
        };
      }
      case "icrc34_delegation": {
        const delegationRequest = request as DelegationRequest;
        const identity = this.#agent.config.identity as SignIdentity;
        const delegationChain =
          identity instanceof DelegationIdentity
            ? identity.getDelegation()
            : undefined;
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
      }
      case "icrc49_call_canister": {
        const callCanisterRequest = request as CallCanisterRequest;
        const { pollForResponse, defaultStrategy } = polling;
        const canisterId = Principal.fromText(
          callCanisterRequest.params!.canisterId,
        );
        if (
          callCanisterRequest.params?.sender !==
          this.#agent.getPrincipal().toString()
        ) {
          throw new AgentTransportError("Sender does not match Agent identity");
        }
        const agent = await HttpAgent.from(this.#agent);
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
      }
      case "icrc112_batch_call_canister": {
        const batchCallCanisterRequest = request as BatchCallCanisterRequest;
        const { pollForResponse, defaultStrategy } = polling;
        const validationActor = batchCallCanisterRequest.params?.validation
          ? Actor.createActor(
            ({ IDL }) =>
              IDL.Service({
                [batchCallCanisterRequest.params!.validation!.method]:
                  IDL.Func(
                    [
                      IDL.Record({
                        canister_id: IDL.Principal,
                        method: IDL.Text,
                        arg: IDL.Vec(IDL.Nat8),
                        res: IDL.Vec(IDL.Nat8),
                        nonce: IDL.Opt(IDL.Vec(IDL.Nat8)),
                      }),
                    ],
                    [IDL.Bool],
                    [],
                  ),
              }),
            {
              canisterId:
                batchCallCanisterRequest.params?.validation?.canisterId,
              agent: this.#agent,
            },
          )
          : undefined;
        const batchCallCanisterResponse: BatchCallCanisterResponse = {
          id,
          jsonrpc: "2.0",
          result: {
            responses: [],
          },
        };
        let batchFailed = false;
        for (const requests of batchCallCanisterRequest.params!.requests) {
          batchCallCanisterResponse.result.responses.push(
            await Promise.all(
              requests.map(async (request) => {
                if (batchFailed) {
                  return {
                    error: {
                      code: 1001,
                      message: "Request not processed.",
                    },
                  };
                }
                try {
                  const canisterId = Principal.fromText(request.canisterId);
                  const agent = await HttpAgent.from(this.#agent);
                  let contentMap: ArrayBuffer =
                    undefined as unknown as ArrayBuffer;
                  agent.addTransform("update", async (agentRequest) => {
                    contentMap = Cbor.encode(agentRequest.body);
                    return agentRequest;
                  });
                  const submitResponse = await agent.call(canisterId, {
                    effectiveCanisterId: canisterId,
                    methodName: request.method,
                    arg: fromBase64(request.arg),
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
                  const validCertificate = await Certificate.create({
                    certificate,
                    rootKey: agent.rootKey ?? ROOT_KEY,
                    canisterId,
                  });
                  const status = validCertificate.lookup([
                    "request_status",
                    submitResponse.requestId,
                    "status",
                  ]);
                  const reply = validCertificate.lookup([
                    "request_status",
                    submitResponse.requestId,
                    "reply",
                  ]);
                  if (
                    status.status !== LookupStatus.Found ||
                    new TextDecoder().decode(status.value as ArrayBuffer) !==
                    "replied" ||
                    reply.status !== LookupStatus.Found
                  ) {
                    batchFailed = true;
                    return {
                      error: {
                        code: 4000,
                        message: "Certificate is missing reply.",
                      },
                    };
                  }
                  if (
                    request.method.startsWith("icrc1_") ||
                    request.method.startsWith("icrc2_") ||
                    request.method.startsWith("icrc7_") ||
                    request.method.startsWith("icrc37_")
                  ) {
                    // Built in validation, basically checks if variant with Err is returned
                    try {
                      const value = IDL.decode(
                        [IDL.Variant({ Err: IDL.Reserved })],
                        reply.value as ArrayBuffer
                      );
                      if ("Err" in value) {
                        batchFailed = true;
                        return {
                          error: {
                            code: 1002,
                            message: "Validation failed.",
                          },
                        };
                      }
                    }
                    catch {
                      // If this return error likely the response is not included Err variant
                      // so we can assume it's valid
                    }
                  } else if (validationActor) {
                    if (
                      !(await validationActor[
                        batchCallCanisterRequest.params!.validation!.method
                      ]({
                        canister_id: Principal.fromText(request.canisterId),
                        method: request.method,
                        arg: fromBase64(request.arg),
                        res: reply.value as ArrayBuffer,
                        nonce: request.nonce ? [fromBase64(request.nonce)] : [],
                      }).catch(() => false))
                    ) {
                      batchFailed = true;
                      return {
                        error: {
                          code: 1003,
                          message: "Validation failed.",
                        },
                      };
                    }
                  } else {
                    batchFailed = true;
                    return {
                      error: {
                        code: 1002,
                        message: "Validation required.",
                      },
                    };
                  }
                  return {
                    result: {
                      contentMap: toBase64(contentMap!),
                      certificate: toBase64(certificate),
                    },
                  };
                } catch (error) {
                  batchFailed = true;
                  return {
                    error: {
                      code: 4000,
                      message: "Request failed.",
                      data: error instanceof Error ? error.message : undefined,
                    },
                  };
                }
              }),
            ),
          );
        }
        return batchCallCanisterResponse;
      }
      default:
        return {
          id,
          jsonrpc: "2.0",
          error: { code: NOT_SUPPORTED_ERROR, message: "Not supported" },
        };
    }
  }
}
