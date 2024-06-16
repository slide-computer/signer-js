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

export type SignerPermissionScope =
  | PermissionScope
  | GetAccountsPermissionScope
  | SignChallengePermissionScope
  | GetGlobalDelegationPermissionScope
  | CallCanisterPermissionScope
  | GetSessionDelegationPermissionScope;

export type SignerOptions = {
  transport: Transport;
  crypto?: Pick<Crypto, "randomUUID">;
};
// TODO: Implement channel re-use through interact() pattern
export class Signer {
  private channel?: Channel;
  private establishingChannel?: Promise<void>;

  constructor(private options: SignerOptions) {}

  private get crypto() {
    return this.options.crypto ?? globalThis.crypto;
  }

  public async sendRequest<T extends JsonRequest, S extends JsonResponse>(
    request: T,
  ) {
    if (!this.channel || this.channel.closed) {
      try {
        this.channel = await this.options.transport.establishChannel();
      } catch (error) {
        throw new SignerError({
          code: NETWORK_ERROR,
          message:
            error instanceof Error ? error.message : "Something went wrong",
        });
      }
    }
    return new Promise<JsonResponseResult<S>>(async (resolve, reject) => {
      const listener = this.channel?.registerListener(async (response) => {
        if (response.id !== request.id) {
          return;
        }
        if ("error" in response) {
          reject(new SignerError(response.error));
        }
        if ("result" in response) {
          resolve(response.result as JsonResponseResult<S>);
        }
        listener?.();
      });
      await this.channel?.send(request);
    });
  }

  public async supportedStandards() {
    const response = await this.sendRequest<
      SupportedStandardsRequest,
      SupportedStandardsResponse
    >({
      id: this.crypto.randomUUID(),
      jsonrpc: "2.0",
      method: "icrc25_supported_standards",
    });
    return response.supportedStandards;
  }

  public async requestPermissions(scopes: SignerPermissionScope[]) {
    const response = await this.sendRequest<
      RequestPermissionsRequest,
      RequestPermissionsResponse
    >({
      id: this.crypto.randomUUID(),
      jsonrpc: "2.0",
      method: "icrc25_request_permissions",
      params: { scopes },
    });
    return response.scopes as SignerPermissionScope[];
  }

  public async grantedPermissions() {
    const response = await this.sendRequest<
      GrantedPermissionsRequest,
      GrantedPermissionsResponse
    >({
      id: this.crypto.randomUUID(),
      jsonrpc: "2.0",
      method: "icrc25_granted_permissions",
    });
    return response.scopes as SignerPermissionScope[];
  }

  public async revokePermissions(scopes: SignerPermissionScope[]) {
    const response = await this.sendRequest<
      RevokePermissionsRequest,
      RevokePermissionsResponse
    >({
      id: this.crypto.randomUUID(),
      jsonrpc: "2.0",
      method: "icrc25_revoke_permissions",
      params: { scopes },
    });
    return response.scopes as SignerPermissionScope[];
  }

  public async getAccounts() {
    const response = await this.sendRequest<
      GetAccountsRequest,
      GetAccountsResponse
    >({
      id: this.crypto.randomUUID(),
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

  public async signChallenge(principal: Principal, challenge: ArrayBuffer) {
    const response = await this.sendRequest<
      SignChallengeRequest,
      SignChallengeResponse
    >({
      id: this.crypto.randomUUID(),
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

  public async getGlobalDelegation(params: {
    publicKey: ArrayBuffer;
    principal: Principal;
    targets: Principal[];
    maxTimeToLive?: bigint;
  }) {
    const response = await this.sendRequest<
      GetGlobalDelegationRequest,
      GetGlobalDelegationResponse
    >({
      id: this.crypto.randomUUID(),
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

  public async getSessionDelegation(params: {
    publicKey: ArrayBuffer;
    maxTimeToLive?: bigint;
  }) {
    const response = await this.sendRequest<
      GetSessionDelegationRequest,
      GetSessionDelegationResponse
    >({
      id: this.crypto.randomUUID(),
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

  public async callCanister(params: {
    canisterId: Principal;
    sender: Principal;
    method: string;
    arg: ArrayBuffer;
  }) {
    const response = await this.sendRequest<
      CallCanisterRequest,
      CallCanisterResponse
    >({
      id: this.crypto.randomUUID(),
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
