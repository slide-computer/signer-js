import { Buffer } from "buffer";
import { Principal } from "@dfinity/principal";
import { Delegation, DelegationChain } from "@dfinity/identity";
import { Signature } from "@dfinity/agent";
import { JsonValue } from "@dfinity/candid";
import {
  JsonError,
  JsonRequest,
  JsonResponse,
  JsonResponseResult,
  Transport,
} from "./transport";
import {
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
import {
  GetPrincipalsPermissionScope,
  GetPrincipalsRequest,
  GetPrincipalsResponse,
} from "./icrc31";
import {
  SignChallengePermissionScope,
  SignChallengeRequest,
  SignChallengeResponse,
} from "./icrc32";
import {
  GetDelegationPermissionScope,
  GetDelegationRequest,
  GetDelegationResponse,
} from "./icrc34";
import { BatchCallingPermissionScope } from "./icrc39";
import { CallCanisterRequest, CallCanisterResponse } from "./icrc49";

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
  | GetPrincipalsPermissionScope
  | SignChallengePermissionScope
  | GetDelegationPermissionScope
  | BatchCallingPermissionScope;

export type SignerOptions = {
  transport: Transport;
  crypto?: Pick<Crypto, "randomUUID" | "getRandomValues">;
};

export class Signer {
  constructor(private options: SignerOptions) {}

  public async sendRequest<T extends JsonRequest, S extends JsonResponse>(
    request: T,
  ) {
    return new Promise<JsonResponseResult<S>>(async (resolve, reject) => {
      const listener = await this.options.transport.registerListener(
        async (responses) => {
          const response = responses.find((r) => r.id === request.id);
          if (!response) {
            return;
          }
          if ("error" in response) {
            reject(new SignerError(response.error));
          }
          if ("result" in response) {
            resolve(response.result as JsonResponseResult<S>);
          }
          listener();
        },
      );
      await this.options.transport.send([request]);
    });
  }

  public async supportedStandards() {
    const response = await this.sendRequest<
      SupportedStandardsRequest,
      SupportedStandardsResponse
    >({
      id: this.getCrypto().randomUUID(),
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
      id: this.getCrypto().randomUUID(),
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
      id: this.getCrypto().randomUUID(),
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
      id: this.getCrypto().randomUUID(),
      jsonrpc: "2.0",
      method: "icrc25_revoke_permissions",
      params: { scopes },
    });
    return response.scopes as SignerPermissionScope[];
  }

  public async getPrincipals() {
    const response = await this.sendRequest<
      GetPrincipalsRequest,
      GetPrincipalsResponse
    >({
      id: this.getCrypto().randomUUID(),
      jsonrpc: "2.0",
      method: "icrc31_get_principals",
    });
    return response.principals.map(Principal.fromText);
  }

  public async signChallenge(principal: Principal, challenge: ArrayBuffer) {
    const response = await this.sendRequest<
      SignChallengeRequest,
      SignChallengeResponse
    >({
      id: this.getCrypto().randomUUID(),
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
        response.delegations &&
        DelegationChain.fromDelegations(
          response.delegations.map((signedDelegation) => ({
            delegation: new Delegation(
              Buffer.from(signedDelegation.delegation.pubkey, "base64").buffer,
              BigInt(signedDelegation.delegation.expiration),
              signedDelegation.delegation.targets?.map(Principal.fromText),
            ),
            signature: Buffer.from(signedDelegation.signature, "base64")
              .buffer as Signature,
          })),
          Buffer.from(response.publicKey, "base64").buffer,
        ),
    };
  }

  public async getDelegation(params: {
    publicKey: ArrayBuffer;
    principal: Principal;
    targets?: Principal[];
  }) {
    const response = await this.sendRequest<
      GetDelegationRequest,
      GetDelegationResponse
    >({
      id: this.getCrypto().randomUUID(),
      jsonrpc: "2.0",
      method: "icrc34_get_delegation",
      params: {
        publicKey: Buffer.from(params.publicKey).toString("base64"),
        principal: params.principal.toText(),
        targets: params.targets?.map((p) => p.toText()),
      },
    });
    return DelegationChain.fromDelegations(
      response.delegations.map((signedDelegation) => ({
        delegation: new Delegation(
          Buffer.from(signedDelegation.delegation.pubkey, "base64").buffer,
          BigInt(signedDelegation.delegation.expiration),
          signedDelegation.delegation.targets?.map(Principal.fromText),
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
      id: this.getCrypto().randomUUID(),
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

  private getCrypto(): Pick<Crypto, "randomUUID" | "getRandomValues"> {
    return this.options.crypto ?? window.crypto;
  }
}
