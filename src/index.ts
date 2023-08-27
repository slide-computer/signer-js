import {
  HttpAgentRequest,
  Identity,
  PublicKey,
  ReadRequestType,
  ReadStateRequest,
  requestIdOf,
  Signature,
  SignIdentity,
  SubmitRequestType,
} from "@dfinity/agent";
import { Linking, Message } from "./types";
import {
  DelegationChain,
  DelegationIdentity,
  ECDSAKeyIdentity,
  isDelegationValid,
  SignedDelegation,
} from "@dfinity/identity";
import { Buffer } from "buffer";
import { WebLinking, WebMessage } from "./web";
import { Principal } from "@dfinity/principal";
import {
  base64ToBase64url,
  decodeRequestBody,
  encodeRequestBody,
} from "./utils";

export const SLIDE_ORIGIN = "https://etk52-fqaaa-aaaak-ae4ca-cai.icp0.io";

export interface SubAccount {
  bytes: Uint8Array;
  name: string;
}

export interface SlideIdentityOptions {
  origin?: string;
  scopes?: Principal[];
  identity?: Pick<SignIdentity, "getPublicKey" | "sign">;
  linking?: Linking;
  message?: Message;
}

export class SlideIdentity implements Identity {
  private transformedReadStates: Record<
    string,
    {
      body: ReadStateRequest;
      sender_sig: Uint8Array;
      sender_delegation: SignedDelegation[];
    }
  > = {};
  private principal?: Principal;

  protected constructor(
    private options: Required<SlideIdentityOptions>,
    private delegationChain: DelegationChain,
    private subAccount: SubAccount,
  ) {}

  static async connect(options?: SlideIdentityOptions): Promise<SlideIdentity> {
    const origin = options?.origin ?? SLIDE_ORIGIN;
    const scopes = options?.scopes ?? [];
    const identity = options?.identity ?? (await ECDSAKeyIdentity.generate());
    const linking = options?.linking ?? new WebLinking();
    const message = options?.message ?? new WebMessage({ origin });
    return new Promise<SlideIdentity>(async (resolve, reject) => {
      const listener = message.receive((data) => {
        if (data.id !== "v1/connect") {
          return;
        }
        if ("err" in data) {
          reject(data.err);
          listener();
          return;
        }
        if (
          "ok" in data &&
          "delegation_chain" in data.ok &&
          typeof data.ok.delegation_chain === "string" &&
          "sub_account" in data.ok &&
          typeof data.ok.sub_account === "object" &&
          data.ok.sub_account &&
          "bytes" in data.ok.sub_account &&
          typeof data.ok.sub_account.bytes === "string" &&
          "name" in data.ok.sub_account &&
          typeof data.ok.sub_account.name === "string"
        ) {
          const delegationChain = DelegationChain.fromJSON(
            data.ok.delegation_chain,
          );
          const subAccount: SubAccount = {
            bytes: Buffer.from(data.ok.sub_account.bytes, "base64"),
            name: data.ok.sub_account.name,
          };
          resolve(
            new SlideIdentity(
              {
                ...options,
                origin,
                scopes,
                identity,
                linking,
                message,
              },
              delegationChain,
              subAccount,
            ),
          );
          listener();
          return;
        }
        reject("Invalid data received");
        listener();
      });
      const url = new URL(origin);
      url.pathname = "/api/v1/connect";
      url.searchParams.set(
        "pubkey",
        base64ToBase64url(
          Buffer.from(identity.getPublicKey().toDer()).toString("base64"),
        ),
      );
      url.searchParams.set(
        "challenge",
        base64ToBase64url(
          Buffer.from(
            await identity.sign(new TextEncoder().encode("v1/connect")),
          ).toString("base64"),
        ),
      );
      if (scopes.length) {
        url.searchParams.set(
          "scopes",
          scopes.map((scope) => scope.toText()).join(","),
        );
      }
      linking.open(url.toString());
    });
  }

  public getPublicKey(): PublicKey {
    return {
      toDer: () => this.delegationChain.publicKey,
    };
  }

  public getPrincipal(): Principal {
    if (!this.principal) {
      this.principal = Principal.selfAuthenticating(
        new Uint8Array(this.getPublicKey().toDer()),
      );
    }
    return this.principal;
  }

  public transformRequest(request: HttpAgentRequest): Promise<unknown> {
    const { body, ...fields } = request;

    if (isDelegationValid(this.delegationChain, { scope: body.canister_id })) {
      return DelegationIdentity.fromDelegation(
        this.options.identity,
        this.delegationChain,
      ).transformRequest(request);
    }

    if (body.request_type === ReadRequestType.ReadState) {
      if (body.paths.length === 1 && body.paths[0].length == 2) {
        const path = new TextDecoder().decode(body.paths[0][0]);
        const id = Buffer.from(body.paths[0][1]).toString("base64");
        if (path === "request_status" && id in this.transformedReadStates) {
          const transformedReadState = this.transformedReadStates[id];
          delete this.transformedReadStates[id];
          return Promise.resolve({
            ...fields,
            body: {
              content: body,
              sender_pubkey: this.getPublicKey().toDer(),
              ...transformedReadState,
            },
          });
        }
      }
      throw Error(
        "Invalid request, unable to read state for request not approved by user",
      );
    }

    return new Promise<unknown>(async (resolve, reject) => {
      const requestId = await requestIdOf(body);
      const id = Buffer.from(requestId).toString("base64");
      const listener = this.options.message.receive(async (data) => {
        if (data.id !== `v1/sign/${id}`) {
          return;
        }
        if ("err" in data) {
          reject(data.err);
          listener();
          return;
        }
        if ("ok" in data) {
          if (
            "delegation_chain" in data.ok &&
            typeof data.ok.delegation_chain === "string"
          ) {
            // If current delegation is expired or expires soon, a new delegation is returned by the wallet to replace it
            this.delegationChain = DelegationChain.fromJSON(
              data.ok.delegation_chain,
            );
          }
          if (
            "transformed_request" in data.ok &&
            typeof data.ok.transformed_request === "object" &&
            data.ok.transformed_request &&
            "sender_sig" in data.ok.transformed_request &&
            typeof data.ok.transformed_request.sender_sig === "string" &&
            "sender_delegation" in data.ok.transformed_request &&
            typeof data.ok.transformed_request.sender_delegation === "string"
          ) {
            if (body.request_type === SubmitRequestType.Call) {
              if (
                "transformed_read_state" in data.ok &&
                typeof data.ok.transformed_read_state === "object" &&
                data.ok.transformed_read_state &&
                "body" in data.ok.transformed_read_state &&
                typeof data.ok.transformed_read_state.body === "string" &&
                "sender_sig" in data.ok.transformed_read_state &&
                typeof data.ok.transformed_read_state.sender_sig === "string" &&
                "sender_delegation" in data.ok.transformed_read_state &&
                typeof data.ok.transformed_read_state.sender_delegation ===
                  "string"
              ) {
                this.transformedReadStates[id] = {
                  body: decodeRequestBody(
                    Buffer.from(data.ok.transformed_read_state.body, "base64"),
                  ) as ReadStateRequest,
                  sender_sig: Buffer.from(
                    data.ok.transformed_read_state.sender_sig,
                    "base64",
                  ),
                  sender_delegation: DelegationChain.fromJSON(
                    data.ok.transformed_read_state.sender_delegation,
                  ).delegations,
                };
              } else {
                reject("Invalid data received");
                listener();
                return;
              }
            }
            resolve({
              ...fields,
              body: {
                content: body,
                sender_sig: Buffer.from(
                  data.ok.transformed_request.sender_sig,
                  "base64",
                ),
                sender_delegation: DelegationChain.fromJSON(
                  data.ok.transformed_request.sender_delegation,
                ).delegations,
                sender_pubkey: this.getPublicKey().toDer(),
              },
            });
            listener();
            return;
          }
        }
        reject("Invalid data received");
        listener();
      });
      const url = new URL(this.options.origin);
      url.pathname = "/api/v1/sign";
      url.searchParams.set(
        "request",
        base64ToBase64url(
          Buffer.from(encodeRequestBody(body)).toString("base64"),
        ),
      );
      url.searchParams.set(
        "pubkey",
        base64ToBase64url(
          Buffer.from(this.options.identity.getPublicKey().toDer()).toString(
            "base64",
          ),
        ),
      );
      url.searchParams.set(
        "challenge",
        base64ToBase64url(
          Buffer.from(await this.options.identity.sign(requestId)).toString(
            "base64",
          ),
        ),
      );
      this.options.linking.open(url.toString());
    });
  }

  public sign(blob: ArrayBuffer): Promise<Signature> {
    throw Error(
      "Directly signing request data is not supported, use transformRequest method instead",
    );
  }

  public getSubAccount(): SubAccount {
    return this.subAccount;
  }
}

export * from "./types";
export * from "./utils";
export * from "./web";
