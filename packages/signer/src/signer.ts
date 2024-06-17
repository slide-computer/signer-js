import { Buffer } from "buffer";
import { Principal } from "@dfinity/principal";
import { Delegation, DelegationChain } from "@dfinity/identity";
import type { Signature } from "@dfinity/agent";
import type { JsonValue } from "@dfinity/candid";
import type {
  Channel,
  JsonError,
  JsonRequest,
  JsonResponse,
  JsonResponseResult,
  Transport,
} from "./transport";
import type {
  GrantedPermissionsRequest,
  GrantedPermissionsResponse,
  PermissionScope,
  RequestPermissionsRequest,
  RequestPermissionsResponse,
  RevokePermissionsRequest,
  RevokePermissionsResponse,
  SupportedStandardsRequest,
  SupportedStandardsResponse,
} from "./icrc25";
import type {
  GetAccountsPermissionScope,
  GetAccountsRequest,
  GetAccountsResponse,
} from "./icrc27";
import type {
  SignChallengePermissionScope,
  SignChallengeRequest,
  SignChallengeResponse,
} from "./icrc32";
import type {
  GetGlobalDelegationPermissionScope,
  GetGlobalDelegationRequest,
  GetGlobalDelegationResponse,
} from "./icrc34";
import type {
  CallCanisterPermissionScope,
  CallCanisterRequest,
  CallCanisterResponse,
} from "./icrc49";
import type {
  GetSessionDelegationPermissionScope,
  GetSessionDelegationRequest,
  GetSessionDelegationResponse,
} from "./icrc57";
import { NETWORK_ERROR } from "./errors";

export class SignerError extends Error {
  public code: number;
  public data?: JsonValue;

  constructor(error: JsonError) {
    super(error.message);
    Object.setPrototypeOf(this, SignerError.prototype);

    this.code = error.code;
    this.data = error.data;
  }
}

const wrapChannelError = (error: unknown) =>
  new SignerError({
    code: NETWORK_ERROR,
    message: error instanceof Error ? error.message : "Something went wrong",
  });

export type SignerPermissionScope =
  | PermissionScope
  | GetAccountsPermissionScope
  | SignChallengePermissionScope
  | GetGlobalDelegationPermissionScope
  | CallCanisterPermissionScope
  | GetSessionDelegationPermissionScope;

export type SignerOptions = {
  /**
   * The transport used to send and receive messages
   */
  transport: Transport;
  /**
   * Automatically close transport channel after a given duration in ms, set to -1 to disable.
   * @default 200
   */
  closeTransportChannelAfter?: number;
  /**
   * Get random uuid implementation for request message ids
   * @default window.crypto
   */
  crypto?: Pick<Crypto, "randomUUID">;
};

export class Signer {
  #options: SignerOptions;
  #channel?: Channel;
  #establishingChannel?: Promise<void>;
  #scheduledChannelClosure?: number;

  constructor(options: SignerOptions) {
    this.#options = options;
  }

  get #crypto() {
    return this.#options.crypto ?? globalThis.crypto;
  }

  async openChannel(): Promise<Channel> {
    // Stop any existing channel from being closed
    clearTimeout(this.#scheduledChannelClosure);

    // Wait for ongoing establishing of a channel
    if (this.#establishingChannel) {
      await this.#establishingChannel;
    }

    // Reuse existing channel
    if (this.#channel && !this.#channel.closed) {
      return this.#channel;
    }

    // Establish a new transport channel
    const channel = this.#options.transport.establishChannel();
    // Indicate that transport channel is being established
    this.#establishingChannel = channel.then(() => {}).catch(() => {});
    // Clear previous transport channel
    this.#channel = undefined;
    // Assign transport channel once established
    this.#channel = await channel.catch((error) => {
      throw wrapChannelError(error);
    });
    // Remove transport channel being established indicator
    this.#establishingChannel = undefined;
    // Return established channel
    return this.#channel;
  }

  async closeChannel(): Promise<void> {
    await this.#channel?.close();
  }

  async sendRequest<T extends JsonRequest, S extends JsonResponse>(request: T) {
    return new Promise<JsonResponseResult<S>>(async (resolve, reject) => {
      // Establish new or re-use existing transport channel
      const channel = await this.openChannel();

      // Listen on transport channel for incoming response
      const listener = channel.registerListener(async (response) => {
        if (response.id !== request.id) {
          // Ignore responses that don't match the request id
          return;
        }

        // Reject or resolve based on response value
        if ("error" in response) {
          reject(new SignerError(response.error));
        }
        if ("result" in response) {
          resolve(response.result as JsonResponseResult<S>);
        }

        // Stop listening to responses once a valid response has been received
        listener();

        // Close transport channel after a certain timeout
        if (this.#options.closeTransportChannelAfter !== -1) {
          this.#scheduledChannelClosure = setTimeout(() => {
            if (!channel.closed) {
              channel.close();
            }
          }, this.#options.closeTransportChannelAfter ?? 200);
        }
      });

      // Send outgoing request over transport channel
      try {
        await channel.send(request);
      } catch (error) {
        listener();
        throw wrapChannelError(error);
      }
    });
  }

  async supportedStandards() {
    const response = await this.sendRequest<
      SupportedStandardsRequest,
      SupportedStandardsResponse
    >({
      id: this.#crypto.randomUUID(),
      jsonrpc: "2.0",
      method: "icrc25_supported_standards",
    });
    return response.supportedStandards;
  }

  async requestPermissions(scopes: SignerPermissionScope[]) {
    const response = await this.sendRequest<
      RequestPermissionsRequest,
      RequestPermissionsResponse
    >({
      id: this.#crypto.randomUUID(),
      jsonrpc: "2.0",
      method: "icrc25_request_permissions",
      params: { scopes },
    });
    return response.scopes as SignerPermissionScope[];
  }

  async grantedPermissions() {
    const response = await this.sendRequest<
      GrantedPermissionsRequest,
      GrantedPermissionsResponse
    >({
      id: this.#crypto.randomUUID(),
      jsonrpc: "2.0",
      method: "icrc25_granted_permissions",
    });
    return response.scopes as SignerPermissionScope[];
  }

  async revokePermissions(scopes: SignerPermissionScope[]) {
    const response = await this.sendRequest<
      RevokePermissionsRequest,
      RevokePermissionsResponse
    >({
      id: this.#crypto.randomUUID(),
      jsonrpc: "2.0",
      method: "icrc25_revoke_permissions",
      params: { scopes },
    });
    return response.scopes as SignerPermissionScope[];
  }

  async getAccounts() {
    const response = await this.sendRequest<
      GetAccountsRequest,
      GetAccountsResponse
    >({
      id: this.#crypto.randomUUID(),
      jsonrpc: "2.0",
      method: "icrc27_get_accounts",
    });
    return response.accounts.map(({ owner, subaccount }) => ({
      owner: Principal.fromText(owner),
      subaccount:
        subaccount === undefined
          ? undefined
          : Buffer.from(subaccount, "base64").buffer,
    }));
  }

  async signChallenge(principal: Principal, challenge: ArrayBuffer) {
    const response = await this.sendRequest<
      SignChallengeRequest,
      SignChallengeResponse
    >({
      id: this.#crypto.randomUUID(),
      jsonrpc: "2.0",
      method: "icrc32_sign_challenge",
      params: {
        principal: principal.toText(),
        challenge: Buffer.from(challenge).toString("base64"),
      },
    });
    return {
      publicKey: Buffer.from(response.publicKey, "base64"),
      signature: Buffer.from(response.signature, "base64"),
      delegationChain:
        response.signer_delegation &&
        DelegationChain.fromDelegations(
          response.signer_delegation.map((signedDelegation) => ({
            delegation: new Delegation(
              Buffer.from(signedDelegation.delegation.pubkey, "base64").buffer,
              BigInt(signedDelegation.delegation.expiration),
              signedDelegation.delegation.targets?.map((principal) =>
                Principal.fromText(principal),
              ),
            ),
            signature: Buffer.from(signedDelegation.signature, "base64")
              .buffer as Signature,
          })),
          Buffer.from(response.publicKey, "base64").buffer,
        ),
    };
  }

  async getGlobalDelegation(params: {
    publicKey: ArrayBuffer;
    principal: Principal;
    targets: Principal[];
    maxTimeToLive?: bigint;
  }) {
    const response = await this.sendRequest<
      GetGlobalDelegationRequest,
      GetGlobalDelegationResponse
    >({
      id: this.#crypto.randomUUID(),
      jsonrpc: "2.0",
      method: "icrc34_get_global_delegation",
      params: {
        publicKey: Buffer.from(params.publicKey).toString("base64"),
        principal: params.principal.toText(),
        targets: params.targets.map((p) => p.toText()),
        maxTimeToLive:
          params.maxTimeToLive === undefined
            ? undefined
            : String(params.maxTimeToLive),
      },
    });
    return DelegationChain.fromDelegations(
      response.global_delegation.map((signedDelegation) => ({
        delegation: new Delegation(
          Buffer.from(signedDelegation.delegation.pubkey, "base64").buffer,
          BigInt(signedDelegation.delegation.expiration),
          signedDelegation.delegation.targets?.map((principal) =>
            Principal.fromText(principal),
          ),
        ),
        signature: Buffer.from(signedDelegation.signature, "base64")
          .buffer as Signature,
      })),
      Buffer.from(response.publicKey, "base64").buffer,
    );
  }

  async getSessionDelegation(params: {
    publicKey: ArrayBuffer;
    maxTimeToLive?: bigint;
  }) {
    const response = await this.sendRequest<
      GetSessionDelegationRequest,
      GetSessionDelegationResponse
    >({
      id: this.#crypto.randomUUID(),
      jsonrpc: "2.0",
      method: "icrc57_get_session_delegation",
      params: {
        publicKey: Buffer.from(params.publicKey).toString("base64"),
        maxTimeToLive:
          params.maxTimeToLive === undefined
            ? undefined
            : String(params.maxTimeToLive),
      },
    });
    return DelegationChain.fromDelegations(
      response.session_delegation.map((signedDelegation) => ({
        delegation: new Delegation(
          Buffer.from(signedDelegation.delegation.pubkey, "base64").buffer,
          BigInt(signedDelegation.delegation.expiration),
          signedDelegation.delegation.targets?.map((principal) =>
            Principal.fromText(principal),
          ),
        ),
        signature: Buffer.from(signedDelegation.signature, "base64")
          .buffer as Signature,
      })),
      Buffer.from(response.publicKey, "base64").buffer,
    );
  }

  async callCanister(params: {
    canisterId: Principal;
    sender: Principal;
    method: string;
    arg: ArrayBuffer;
  }) {
    const response = await this.sendRequest<
      CallCanisterRequest,
      CallCanisterResponse
    >({
      id: this.#crypto.randomUUID(),
      jsonrpc: "2.0",
      method: "icrc49_call_canister",
      params: {
        canisterId: params.canisterId.toText(),
        sender: params.sender.toText(),
        method: params.method,
        arg: Buffer.from(params.arg).toString("base64"),
      },
    });
    return {
      contentMap: Buffer.from(response.contentMap, "base64").buffer,
      certificate: Buffer.from(response.certificate, "base64").buffer,
    };
  }
}
