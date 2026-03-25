import {
  type Agent,
  type ApiQueryResponse,
  Certificate,
  type CallRequest,
  HttpAgent,
  IC_ROOT_KEY,
  type Identity,
  LookupPathStatus,
  type QueryFields,
  type QueryResponseStatus,
  type ReadStateOptions,
  type ReadStateResponse,
  type RequestId,
  requestIdOf,
  SubmitRequestType,
  type SubmitResponse,
  type UpdateResult,
  type CallOptions,
} from "@icp-sdk/core/agent";
import { type JsonObject, uint8Equals } from "@icp-sdk/core/candid";
import { Principal } from "@icp-sdk/core/principal";
import { type Signer, type Transport, toBase64 } from "../index.js";
import { decodeCallRequest } from "./utils.js";

const ROOT_KEY = new Uint8Array(
  IC_ROOT_KEY.match(/[\da-f]{2}/gi)!.map((h) => parseInt(h, 16)),
);
const MAX_AGE_IN_MINUTES = 5;
const INVALID_RESPONSE_MESSAGE = "Received invalid response from signer";

export interface SignerAgentOptions<T extends Transport = Transport> {
  /**
   * Signer instance that should be used to send ICRC-25 JSON-RPC messages
   */
  signer: Signer<T>;
  /**
   * Principal of account that should be used to make calls
   */
  account: Principal;
  /**
   * Optional, used to fetch root key
   * @default uses {@link HttpAgent} by default
   */
  agent?: HttpAgent;
}

export class SignerAgentError extends Error {}

interface VerifiedCall {
  requestId: RequestId;
  requestBody: CallRequest;
  certificate: Certificate;
  rawCertificate: Uint8Array;
  reply: Uint8Array;
}

export class SignerAgent<T extends Transport = Transport> implements Agent {
  static #isInternalConstructing: boolean = false;
  readonly #options: Required<SignerAgentOptions>;
  readonly #certificates = new Map<string, Uint8Array>();
  #pending: Promise<void> = Promise.resolve();

  private constructor(options: Required<SignerAgentOptions>) {
    const throwError = !SignerAgent.#isInternalConstructing;
    SignerAgent.#isInternalConstructing = false;
    if (throwError) {
      throw new SignerAgentError("SignerAgent is not constructable");
    }
    this.#options = options;
  }

  get rootKey() {
    return this.#options.agent.rootKey ?? ROOT_KEY;
  }

  get signer(): Signer<T> {
    return this.#options.signer as unknown as Signer<T>;
  }

  static async create<T extends Transport>(options: SignerAgentOptions<T>) {
    SignerAgent.#isInternalConstructing = true;
    return new SignerAgent({
      ...options,
      agent: options.agent ?? (await HttpAgent.create()),
    }) as SignerAgent<T>;
  }

  static createSync<T extends Transport>(options: SignerAgentOptions<T>) {
    SignerAgent.#isInternalConstructing = true;
    return new SignerAgent({
      ...options,
      agent: options.agent ?? HttpAgent.createSync(),
    }) as SignerAgent<T>;
  }

  /**
   * Sends a canister call through the signer, validates the response,
   * and returns the verified certificate with the reply.
   */
  async #sendAndVerify(
    canisterId: Principal,
    fields: CallOptions,
  ): Promise<VerifiedCall> {
    // Open the transport channel first to avoid blocking popups
    await this.#options.signer.openChannel();

    // Queue the call to ensure sequential execution
    const response = await new Promise<
      Awaited<ReturnType<Signer["callCanister"]>>
    >((resolve, reject) => {
      this.#pending = this.#pending.finally(() =>
        this.signer
          .callCanister({
            canisterId,
            sender: this.#options.account,
            method: fields.methodName,
            arg: fields.arg,
          })
          .then(resolve, reject),
      );
    });

    // Validate content map
    const requestBody = decodeCallRequest(response.contentMap);
    const contentMapMatchesRequest =
      SubmitRequestType.Call === requestBody.request_type &&
      canisterId.toText() === requestBody.canister_id.toText() &&
      fields.methodName === requestBody.method_name &&
      uint8Equals(fields.arg, requestBody.arg) &&
      this.#options.account.toText() ===
        Principal.from(requestBody.sender).toText();
    if (!contentMapMatchesRequest) {
      throw new SignerAgentError(INVALID_RESPONSE_MESSAGE);
    }

    // Validate certificate
    const requestId = requestIdOf(requestBody);
    const certificate = await Certificate.create({
      certificate: response.certificate,
      rootKey: this.rootKey,
      principal: { canisterId },
      maxAgeInMinutes: MAX_AGE_IN_MINUTES,
    }).catch((cause) => {
      throw new SignerAgentError(INVALID_RESPONSE_MESSAGE, { cause });
    });

    // Extract reply
    const replyLookup = certificate.lookup_path([
      "request_status",
      requestId,
      "reply",
    ]);
    if (replyLookup.status !== LookupPathStatus.Found) {
      throw new SignerAgentError(INVALID_RESPONSE_MESSAGE);
    }

    // Store raw certificate for readState lookups
    this.#certificates.set(toBase64(requestId), response.certificate);

    return {
      requestId,
      requestBody,
      certificate,
      rawCertificate: response.certificate,
      reply: replyLookup.value,
    };
  }

  async call(
    canisterId: Principal | string,
    fields: CallOptions,
  ): Promise<SubmitResponse> {
    canisterId = Principal.from(canisterId);
    const { requestId, requestBody } = await this.#sendAndVerify(
      canisterId,
      fields,
    );
    return {
      requestId,
      response: {
        ok: true,
        status: 202,
        statusText: "Call has been sent over ICRC-25 JSON-RPC",
        body: null,
        headers: [],
      },
      requestDetails: requestBody,
    };
  }

  async update(
    canisterId: Principal | string,
    fields: CallOptions,
  ): Promise<UpdateResult> {
    canisterId = Principal.from(canisterId);
    const { requestBody, certificate, rawCertificate, reply } =
      await this.#sendAndVerify(canisterId, fields);
    return {
      certificate,
      reply,
      rawCertificate,
      requestDetails: requestBody,
      callResponse: {
        ok: true,
        status: 202,
        statusText: "Call has been sent over ICRC-25 JSON-RPC",
        body: null,
        headers: [],
      },
    };
  }

  async query(
    canisterId: Principal | string,
    options: QueryFields,
  ): Promise<ApiQueryResponse> {
    canisterId = Principal.from(canisterId);
    const { requestId, reply } = await this.#sendAndVerify(canisterId, {
      methodName: options.methodName,
      arg: options.arg,
      effectiveCanisterId: canisterId,
    });
    return {
      requestId,
      status: "replied" as QueryResponseStatus.Replied,
      reply: { arg: reply },
      httpDetails: {
        ok: true,
        status: 202,
        statusText:
          "Certificate with reply has been received over ICRC-25 JSON-RPC",
        headers: [],
      },
    };
  }

  async fetchRootKey(): Promise<Uint8Array> {
    return this.#options.agent.fetchRootKey();
  }

  async getPrincipal(): Promise<Principal> {
    return this.#options.account;
  }

  async createReadStateRequest(
    _options: ReadStateOptions,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return { body: { content: {} } };
  }

  async readState(
    _canisterId: Principal | string,
    options: ReadStateOptions,
    _identity?: Identity | Promise<Identity>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _request?: any,
  ): Promise<ReadStateResponse> {
    if (
      options.paths.length !== 1 ||
      options.paths[0].length !== 2 ||
      new TextDecoder().decode(options.paths[0][0]) !== "request_status"
    ) {
      throw new SignerAgentError("Given paths are not supported");
    }
    const requestId = options.paths[0][1] as RequestId;
    const key = toBase64(requestId);
    const certificate = this.#certificates.get(key);
    if (!certificate) {
      throw new SignerAgentError("Certificate could not be found");
    }
    this.#certificates.delete(key);
    return { certificate };
  }

  async status(): Promise<JsonObject> {
    return this.#options.agent.status();
  }

  replaceAccount(account: Principal) {
    this.#options.account = account;
  }
}
