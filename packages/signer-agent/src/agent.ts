import {
  type Agent,
  type ApiQueryResponse,
  Certificate,
  compare,
  HttpAgent,
  type Identity,
  LookupStatus,
  type QueryFields,
  type QueryResponseStatus,
  type ReadStateOptions,
  type ReadStateResponse,
  type RequestId,
  requestIdOf,
  SubmitRequestType,
  type SubmitResponse,
} from "@dfinity/agent";
import type {JsonObject} from "@dfinity/candid";
import {Principal} from "@dfinity/principal";
import {type Signer, toBase64} from "@slide-computer/signer";
import {decodeCallRequest} from "./utils";

export interface SignerAgentOptions {
  /**
   * Signer instance that should be used to send ICRC-25 JSON-RPC messages
   */
  signer: Pick<Signer, "callCanister">;
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

export class SignerAgentError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, SignerAgentError.prototype);
  }
}

export class SignerAgent implements Agent {
  static #isInternalConstructing: boolean = false;
  readonly #options: Required<SignerAgentOptions>;
  readonly #certificates = new Map<string, ArrayBuffer>();

  constructor(options: Required<SignerAgentOptions>) {
    const throwError = !SignerAgent.#isInternalConstructing;
    SignerAgent.#isInternalConstructing = false;
    if (throwError) {
      throw new SignerAgentError(
        "SignerAgent is not constructable",
      );
    }
    this.#options = options;
  }

  get rootKey() {
    return this.#options.agent.rootKey;
  }

  async create(options: SignerAgentOptions) {
    SignerAgent.#isInternalConstructing = true;
    return new SignerAgent({
      ...options,
      agent: options.agent ?? await HttpAgent.create(),
    });
  }

  async call(
    canisterId: Principal | string,
    options: {
      methodName: string;
      arg: ArrayBuffer;
      effectiveCanisterId?: Principal | string;
    },
  ): Promise<SubmitResponse> {
    // Make sure canisterId is a principal
    canisterId = Principal.from(canisterId);

    // Make call through signer
    const response = await this.#options.signer.callCanister({
      canisterId,
      sender: this.#options.account,
      method: options.methodName,
      arg: options.arg,
    });

    // Validate content map
    const requestBody = decodeCallRequest(response.contentMap);
    const contentMapMatchesRequest =
      SubmitRequestType.Call === requestBody.request_type &&
      canisterId.compareTo(requestBody.canister_id) === "eq" &&
      options.methodName === requestBody.method_name &&
      compare(options.arg, requestBody.arg) === 0 &&
      this.#options.account.compareTo(Principal.from(requestBody.sender)) ===
      "eq";
    if (!contentMapMatchesRequest) {
      throw new SignerAgentError("Received invalid content map from signer");
    }

    // Validate certificate
    const requestId = requestIdOf(requestBody);
    const certificate = await Certificate.create({
      certificate: response.certificate,
      rootKey: this.rootKey,
      canisterId,
    }).catch(() => {
      throw new SignerAgentError("Received invalid certificate from signer");
    });
    const certificateIsResponseToContentMap =
      certificate.lookup(["request_status", requestId, "status"]).status ===
      LookupStatus.Found;
    if (!certificateIsResponseToContentMap) {
      throw new SignerAgentError('Received invalid certificate from signer"');
    }

    // Store certificate in map and return request id with http response
    this.#certificates.set(toBase64(requestId), response.certificate);
    return {
      requestId,
      response: {
        ok: true,
        status: 200,
        statusText: "Call has been sent over ICRC-25 JSON-RPC",
        body: null,
        headers: [],
      },
    };
  }

  async fetchRootKey(): Promise<ArrayBuffer> {
    return this.#options.agent.fetchRootKey();
  }

  async getPrincipal(): Promise<Principal> {
    return this.#options.account;
  }

  async query(
    canisterId: Principal | string,
    options: QueryFields,
  ): Promise<ApiQueryResponse> {
    // Make sure canisterId is a principal
    canisterId = Principal.from(canisterId);

    // Upgrade query request to a call sent through signer
    const submitResponse = await this.call(canisterId, options);
    const readStateResponse = await this.readState(canisterId, {
      paths: [
        [new TextEncoder().encode("request_status"), submitResponse.requestId],
      ],
    });
    const certificate = await Certificate.create({
      certificate: readStateResponse.certificate,
      rootKey: this.rootKey,
      canisterId,
    });
    const status = certificate.lookup([
      "request_status",
      submitResponse.requestId,
      "status",
    ]);
    const reply = certificate.lookup([
      "request_status",
      submitResponse.requestId,
      "reply",
    ]);
    if (
      status.status !== LookupStatus.Found ||
      new TextDecoder().decode(status.value as ArrayBuffer) !== "replied" ||
      reply.status !== LookupStatus.Found
    ) {
      throw new SignerAgentError("Certificate is missing reply");
    }
    return {
      requestId: submitResponse.requestId,
      status: "replied" as QueryResponseStatus.Replied,
      reply: {
        arg: reply.value as ArrayBuffer,
      },
      httpDetails: {
        ok: true,
        status: 200,
        statusText:
          "Certificate with reply has been received over ICRC-25 JSON-RPC",
        headers: [],
      },
    };
  }

  async createReadStateRequest(
    _options: ReadStateOptions,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
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
    return {certificate};
  }

  async status(): Promise<JsonObject> {
    return this.#options.agent.status();
  }

  replaceAccount(account: Principal) {
    this.#options.account = account;
  }
}
