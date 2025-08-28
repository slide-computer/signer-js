import {
  type Agent,
  type ApiQueryResponse,
  Certificate,
  compare,
  HttpAgent,
  IC_ROOT_KEY,
  type Identity,
  lookupResultToBuffer,
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
import { type JsonObject, lebDecode, PipeArrayBuffer } from "@dfinity/candid";
import { Principal } from "@dfinity/principal";
import { type Signer, toBase64 } from "@slide-computer/signer";
import { decodeCallRequest } from "./utils";
import { Queue } from "./queue";

const ROOT_KEY = new Uint8Array(
  IC_ROOT_KEY.match(/[\da-f]{2}/gi)!.map((h) => parseInt(h, 16)),
).buffer;
const MAX_AGE_IN_MINUTES = 5;
const INVALID_RESPONSE_MESSAGE = "Received invalid response from signer";

export interface SignerAgentOptions<T extends Pick<Signer, "callCanister">> {
  /**
   * Signer instance that should be used to send ICRC-25 JSON-RPC messages
   */
  signer: T;
  /**
   * Principal of account that should be used to make calls
   */
  account: Principal;
  /**
   * Optional, used to fetch root key
   * @default uses {@link HttpAgent} by default
   */
  agent?: HttpAgent;
  /**
   * Optional, delay in milliseconds used to detect parallel calls and turn them into a single batch call
   * @default 20
   */
  scheduleDelay?: number;
  /**
   * Optional, validation used with batch call canister
   * @default null
   */
  validation?: { canisterId: Principal; method: string } | null;
}

export class SignerAgentError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, SignerAgentError.prototype);
  }
}

interface ScheduledCall {
  options: {
    canisterId: Principal;
    method: string;
    arg: ArrayBuffer;
  };
  resolve: (response: {
    contentMap: ArrayBuffer;
    certificate: ArrayBuffer;
  }) => void;
  reject: (error: unknown) => void;
}

export class SignerAgent<
  T extends Pick<
    Signer,
    "callCanister" | "openChannel" | "supportedStandards" | "batchCallCanister"
  > = Signer,
> implements Agent {
  // noinspection JSUnusedLocalSymbols
  static #isInternalConstructing: boolean = false;
  readonly #options: Required<SignerAgentOptions<T>>;
  readonly #certificates = new Map<string, ArrayBuffer>();
  readonly #queue = new Queue();
  #executeTimeout?: ReturnType<typeof setTimeout>;
  #scheduled: ScheduledCall[][] = [[]];
  #autoBatch: boolean = true;
  #validationCanisterId?: Principal;

  private constructor(options: Required<SignerAgentOptions<T>>) {
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

  get signer(): T {
    return this.#options.signer;
  }

  static async create<
    T extends Pick<
      Signer,
      | "callCanister"
      | "openChannel"
      | "supportedStandards"
      | "batchCallCanister"
    >,
  >(options: SignerAgentOptions<T>) {
    SignerAgent.#isInternalConstructing = true;
    return new SignerAgent<T>({
      ...options,
      agent: options.agent ?? (await HttpAgent.create()),
      scheduleDelay: options.scheduleDelay ?? 20,
      validation: options.validation ?? null,
    });
  }

  static createSync<
    T extends Pick<
      Signer,
      | "callCanister"
      | "openChannel"
      | "supportedStandards"
      | "batchCallCanister"
    >,
  >(options: SignerAgentOptions<T>) {
    SignerAgent.#isInternalConstructing = true;
    return new SignerAgent<T>({
      ...options,
      agent: options.agent ?? HttpAgent.createSync(),
      scheduleDelay: options.scheduleDelay ?? 20,
      validation: options.validation ?? null,
    });
  }

  async execute() {
    const scheduled = [...this.#scheduled];
    const validation = this.#validationCanisterId;
    this.clear();

    const pending = scheduled.flat().length;
    if (pending === 0) {
      this.#validationCanisterId = undefined;
      return;
    }

    const needsBatch = pending > 1;
    if (!needsBatch) {
      await this.#executeQueue(scheduled);
      return;
    }

    const supportedStandards = await this.#queue.schedule(() =>
      this.signer.supportedStandards(),
    );
    const supportsBatch = supportedStandards.some(
      (supportedStandard) => supportedStandard.name === "ICRC-112",
    );
    if (supportsBatch) {
      await this.#executeBatch(scheduled, validation);
    } else {
      await this.#executeQueue(scheduled);
    }
  }

  async #executeQueue(scheduled: ScheduledCall[][]): Promise<void> {
    await Promise.all(
      scheduled.flat().map(({ options, resolve, reject }) =>
        this.#queue.schedule(async () => {
          try {
            const response = await this.signer.callCanister({
              sender: this.#options.account,
              ...options,
            });
            resolve(response);
          } catch (error) {
            reject(error);
          }
        }),
      ),
    );
  }

  async #executeBatch(
    scheduled: ScheduledCall[][],
    validationCanisterId?: Principal,
  ): Promise<void> {
    await this.#queue.schedule(async () => {
      try {
        const responses = await this.signer.batchCallCanister({
          sender: this.#options.account,
          requests: scheduled.map((entries) =>
            entries.map(({ options }) => options),
          ),
          validationCanisterId,
        });
        scheduled.forEach((entries, sequenceIndex) =>
          entries.forEach(({ resolve, reject }, requestIndex) => {
            const response = responses[sequenceIndex][requestIndex];
            if ("result" in response) {
              resolve(response.result);
              return;
            }
            if ("error" in response) {
              reject(
                new SignerAgentError(
                  `${response.error.code}: ${response.error.message}\n${JSON.stringify(response.error.data)}`,
                ),
              );
              return;
            }
            reject(new SignerAgentError(INVALID_RESPONSE_MESSAGE));
          }),
        );
      } catch (error) {
        // Forward error to each canister call handler
        scheduled.flat().forEach(({ reject }) => reject(error));
      }
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

    // Manually open the transport channel here first to make sure that
    // the scheduler does not e.g. block a popup window from opening.
    await this.#options.signer.openChannel();

    // Make call through scheduler that automatically performs a single call or batch call.
    const response = await new Promise<
      Awaited<ReturnType<Signer["callCanister"]>>
    >((resolve, reject) => {
      clearTimeout(this.#executeTimeout);
      this.#scheduled.slice(-1)[0].push({
        options: {
          canisterId,
          method: options.methodName,
          arg: options.arg,
        },
        resolve,
        reject,
      });
      if (this.#autoBatch) {
        this.#executeTimeout = setTimeout(
          () => this.execute(),
          this.#options.scheduleDelay,
        );
      }
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
      throw new SignerAgentError(INVALID_RESPONSE_MESSAGE);
    }

    // Validate certificate
    const requestId = requestIdOf(requestBody);
    const certificate = await Certificate.create({
      certificate: response.certificate,
      rootKey: this.rootKey,
      canisterId,
      maxAgeInMinutes: MAX_AGE_IN_MINUTES,
    }).catch(() => {
      throw new SignerAgentError(INVALID_RESPONSE_MESSAGE);
    });
    const certificateIsResponseToContentMap =
      certificate.lookup(["request_status", requestId, "status"]).status ===
      LookupStatus.Found;
    if (!certificateIsResponseToContentMap) {
      throw new SignerAgentError(INVALID_RESPONSE_MESSAGE);
    }

    // Check if response has already been received previously to avoid replay attacks
    const requestKey = toBase64(requestId);
    if (this.#certificates.has(requestKey)) {
      throw new SignerAgentError(INVALID_RESPONSE_MESSAGE);
    }

    // Store certificate in map
    this.#certificates.set(requestKey, response.certificate);

    // Cleanup when certificate expires
    const now = Date.now();
    const lookupTime = lookupResultToBuffer(certificate.lookup(["time"]));
    if (!lookupTime) {
      throw new SignerAgentError(INVALID_RESPONSE_MESSAGE);
    }
    const certificateTime =
      Number(lebDecode(new PipeArrayBuffer(lookupTime))) / 1_000_000;
    const expiry = certificateTime - now + MAX_AGE_IN_MINUTES * 60 * 1000;
    setTimeout(() => this.#certificates.delete(requestKey), expiry);

    // Return request id with http response
    return {
      requestId,
      response: {
        ok: true,
        status: 202,
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
        status: 202,
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
    // Since request is typed as any it shouldn't need any data,
    // but since agent-js 2.1.3 this would cause a runtime error.
    return {
      body: {
        content: {},
      },
    };
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
    return { certificate };
  }

  async status(): Promise<JsonObject> {
    return this.#options.agent.status();
  }

  replaceAccount(account: Principal) {
    this.#options.account = account;
  }

  replaceValidationCanisterId(validation?: Principal) {
    this.#validationCanisterId = validation;
  }

  /**
   * Enable manual triggering of canister calls execution
   */
  batch() {
    this.#autoBatch = false;
    if (this.#scheduled.slice(-1)[0].length > 0) {
      this.#scheduled.push([]);
    }
  }

  /**
   * Clear scheduled canister calls and switch back to automatic canister calls execution
   */
  clear() {
    this.#scheduled = [[]];
    this.#autoBatch = true;
  }
}
