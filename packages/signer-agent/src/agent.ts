import {
  type Agent,
  type ApiQueryResponse,
  Certificate,
  compare,
  type CreateCertificateOptions,
  HttpAgent,
  type Identity,
  LookupStatus,
  type QueryFields,
  type QueryResponseStatus,
  type ReadStateOptions,
  type ReadStateResponse,
  type RequestId,
  requestIdOf,
  SignIdentity,
  SubmitRequestType,
  type SubmitResponse,
} from "@dfinity/agent";
import type { JsonObject } from "@dfinity/candid";
import { Principal } from "@dfinity/principal";
import {
  DelegationIdentity,
  ECDSAKeyIdentity,
  Ed25519KeyIdentity,
  isDelegationValid,
} from "@dfinity/identity";
import { Buffer } from "buffer";
import type { Signer } from "@slide-computer/signer";
import {
  getDelegationChain,
  getIdentity,
  IdbStorage,
  setDelegationChain,
  setIdentity,
  type SignerStorage,
} from "@slide-computer/signer-storage";
import { decodeCallRequest } from "./utils/decodeCallRequest";

const ECDSA_KEY_LABEL = "ECDSA";
const ED25519_KEY_LABEL = "Ed25519";
type DelegationKeyType = typeof ECDSA_KEY_LABEL | typeof ED25519_KEY_LABEL;

export interface SignerAgentOptions {
  /** Signer instance that should be used to send ICRC-25 JSON-RPC messages */
  signer: Pick<Signer, "callCanister"> & Partial<Pick<Signer, "delegation">>;
  /** Principal of account that should be used to make calls */
  getPrincipal: () => Promise<Principal> | Principal;
  /**
   * Optional, used to generate random bytes
   * @default uses browser/node Crypto by default
   */
  crypto?: Pick<Crypto, "getRandomValues">;
  /**
   * Optional, used to fetch root key and make delegated calls,
   * @default uses {@link HttpAgent} by default
   */
  agent?: HttpAgent;
  /**
   * Optional polyfill for BLS verify used in query requests that are upgraded to calls
   */
  blsVerify?: CreateCertificateOptions["blsVerify"];
  /**
   * Optional storage with get, set, and remove.
   * @default uses {@link IdbStorage} by default
   */
  storage?: SignerStorage;
  /**
   * Optional, use delegation for calls where possible
   */
  delegation?: {
    /**
     * Limit delegation targets to specific canisters
     */
    targets: Principal[];
    /**
     * Optional identity to use for delegation
     */
    identity?: Pick<SignIdentity, "getPublicKey" | "sign">;
    /**
     * Key type to use for the default delegation identity
     * @default 'ECDSA'
     * If you are using a custom storage provider that does not support CryptoKey storage,
     * you should use 'Ed25519' as the key type, as it can serialize to a string
     */
    keyType?: DelegationKeyType;
  };
}

export class SignerAgentError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, SignerAgentError.prototype);
  }
}

export class SignerAgent implements Agent {
  private readonly agent: HttpAgent;
  private readonly storage: SignerStorage;
  private readonly readStateResponses = new Map<string, ReadStateResponse>();
  private readonly delegatedRequestIds = new Set<string>();

  constructor(private options: SignerAgentOptions) {
    this.agent = options.agent ?? new HttpAgent();
    this.storage = options.storage ?? new IdbStorage();
  }

  public get rootKey() {
    return this.agent.rootKey;
  }

  private get crypto(): Pick<Crypto, "getRandomValues"> {
    return this.options.crypto ?? globalThis.crypto;
  }

  public async getDelegationIdentity(sender: Principal) {
    if (!this.options.delegation) {
      return;
    }
    const baseIdentity = await this.getDelegationBaseIdentity(sender);
    const delegationChain = await this.getDelegationChain(
      sender,
      baseIdentity.getPublicKey().toDer(),
    );
    if (delegationChain) {
      return DelegationIdentity.fromDelegation(baseIdentity, delegationChain);
    }
  }

  public async call(
    canisterId: Principal | string,
    options: {
      methodName: string;
      arg: ArrayBuffer;
      effectiveCanisterId?: Principal | string;
    },
  ): Promise<SubmitResponse> {
    // Get sender and target canister id
    const sender = await this.options.getPrincipal();
    const target = Principal.from(canisterId);

    // Make delegated call when possible
    if (
      this.options.signer.delegation &&
      this.options.delegation &&
      (!this.options.delegation.targets ||
        this.options.delegation.targets.some(
          (target) => target.compareTo(target) === "eq",
        ))
    ) {
      const delegationIdentity = await this.getDelegationIdentity(sender);
      if (delegationIdentity) {
        const submitResponse = await this.agent.call(
          target,
          options,
          delegationIdentity,
        );
        this.delegatedRequestIds.add(
          Buffer.from(submitResponse.requestId).toString("base64"),
        );
        return submitResponse;
      }
    }

    // Make call through signer
    const { contentMap, certificate } = await this.options.signer.callCanister({
      canisterId: target,
      sender,
      method: options.methodName,
      arg: options.arg,
    });
    const requestBody = decodeCallRequest(contentMap);
    if (
      SubmitRequestType.Call !== requestBody.request_type ||
      target.compareTo(requestBody.canister_id) !== "eq" ||
      options.methodName !== requestBody.method_name ||
      compare(options.arg, requestBody.arg) !== 0 ||
      sender.compareTo(Principal.from(requestBody.sender)) !== "eq"
    ) {
      throw new SignerAgentError("Received invalid content map from signer ");
    }
    const requestId = requestIdOf(requestBody);
    this.readStateResponses.set(Buffer.from(requestId).toString("base64"), {
      certificate,
    });
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

  public async fetchRootKey(): Promise<ArrayBuffer> {
    return this.agent.fetchRootKey();
  }

  public async getPrincipal(): Promise<Principal> {
    return this.options.getPrincipal();
  }

  public async query(
    canisterId: Principal | string,
    options: QueryFields,
  ): Promise<ApiQueryResponse> {
    // Get sender and target canister id
    const sender = await this.options.getPrincipal();
    const target = Principal.from(canisterId);

    // Make delegated query when possible
    if (
      this.options.signer.delegation &&
      this.options.delegation &&
      (!this.options.delegation.targets ||
        this.options.delegation.targets.some(
          (target) => target.compareTo(target) === "eq",
        ))
    ) {
      const delegationIdentity = await this.getDelegationIdentity(sender);
      if (delegationIdentity) {
        return this.agent.query(canisterId, options, delegationIdentity);
      }
    }

    // Upgrade query request to a call sent through signer
    const submitResponse = await this.call(canisterId, options);
    const requestKey = Buffer.from(submitResponse.requestId).toString("base64");
    const readStateResponse = this.readStateResponses.get(requestKey);
    if (!readStateResponse) {
      throw new SignerAgentError("Read state response could not be found");
    }
    this.readStateResponses.delete(requestKey);
    const certificate = await Certificate.create({
      certificate: readStateResponse.certificate,
      rootKey: this.rootKey,
      canisterId: target,
      blsVerify: this.options.blsVerify,
    });
    const path = [
      new TextEncoder().encode("request_status"),
      submitResponse.requestId,
    ];
    const statusLookupResult = certificate.lookup([...path, "status"]);
    if (statusLookupResult.status !== LookupStatus.Found) {
      throw new SignerAgentError("Certificate is missing status");
    }
    const status = new TextDecoder().decode(
      statusLookupResult.value as ArrayBuffer,
    );
    if (status !== "replied") {
      throw new SignerAgentError("Certificate status is not replied");
    }
    const replyLookupResult = certificate.lookup([...path, "reply"]);
    if (replyLookupResult.status !== LookupStatus.Found) {
      throw new SignerAgentError("Certificate is missing reply");
    }
    return {
      requestId: submitResponse.requestId,
      status: "replied" as QueryResponseStatus.Replied,
      reply: {
        arg: replyLookupResult.value as ArrayBuffer,
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

  public async createReadStateRequest(
    options: ReadStateOptions,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    const requestId = this.requestIdFromReadStateOptions(options);
    if (!requestId) {
      throw new SignerAgentError(
        "Invalid read state request, request id could not be found in options",
      );
    }
    const requestKey = Buffer.from(requestId).toString("base64");
    if (this.delegatedRequestIds.has(requestKey)) {
      const sender = await this.getPrincipal();
      const delegationIdentity = await this.getDelegationIdentity(sender);
      return this.agent.createReadStateRequest(options, delegationIdentity);
    }
  }

  public async readState(
    canisterId: Principal | string,
    options: ReadStateOptions,
    identity?: Identity | Promise<Identity>,
    // eslint-disable-next-line
    request?: any,
  ): Promise<ReadStateResponse> {
    const requestId = this.requestIdFromReadStateOptions(options);
    if (!requestId) {
      throw new SignerAgentError(
        "Invalid read state request, request id could not be found in options",
      );
    }
    const requestKey = Buffer.from(requestId).toString("base64");
    if (this.delegatedRequestIds.has(requestKey)) {
      this.delegatedRequestIds.delete(requestKey);
      const sender = await this.getPrincipal();
      const delegationIdentity = await this.getDelegationIdentity(sender);
      return this.agent.readState(canisterId, options, delegationIdentity);
    }
    const readStateResponse = this.readStateResponses.get(requestKey);
    if (!readStateResponse) {
      throw new SignerAgentError(
        "Invalid read state request, response could not be found",
      );
    }
    this.readStateResponses.delete(requestKey);
    return readStateResponse;
  }

  public async status(): Promise<JsonObject> {
    return this.agent.status();
  }

  private async getDelegationChain(
    principal: Principal,
    publicKey: ArrayBuffer,
  ) {
    if (!this.options.signer.delegation) {
      throw new SignerAgentError("Signer is missing `delegation` method");
    }
    if (!this.options.delegation) {
      throw new SignerAgentError("Delegation config is missing in options");
    }
    const key = `${principal.toText()}-${Buffer.from(publicKey).toString("base64")}`;
    const delegationChain = await getDelegationChain(key, this.storage);
    if (
      delegationChain &&
      isDelegationValid(delegationChain, {
        scope: this.options.delegation?.targets,
      })
    ) {
      return delegationChain;
    }
    const newDelegationChain = await this.options.signer.delegation({
      publicKey,
      targets: this.options.delegation.targets,
    });
    if (
      Principal.selfAuthenticating(
        new Uint8Array(newDelegationChain.publicKey),
      ).compareTo(principal) !== "eq"
    ) {
      throw new SignerAgentError(
        "Received delegation for different account than expected",
      );
    }
    await setDelegationChain(key, newDelegationChain, this.storage);
    return newDelegationChain;
  }

  private async getDelegationBaseIdentity(sender: Principal) {
    if (this.options.delegation?.identity) {
      return this.options.delegation.identity;
    }
    const identity = await getIdentity(sender.toText(), this.storage);
    if (identity) {
      return identity;
    }
    const newIdentity = await (this.options.delegation?.keyType === "Ed25519"
      ? Ed25519KeyIdentity.generate(
          this.crypto.getRandomValues(new Uint8Array(32)),
        )
      : ECDSAKeyIdentity.generate());
    await setIdentity(sender.toText(), newIdentity, this.storage);
    return newIdentity;
  }

  private requestIdFromReadStateOptions(
    options: ReadStateOptions,
  ): RequestId | undefined {
    if (options.paths.length === 1 && options.paths[0].length == 2) {
      const path = new TextDecoder().decode(options.paths[0][0]);
      if (path === "request_status") {
        return options.paths[0][1] as RequestId;
      }
    }
  }
}
