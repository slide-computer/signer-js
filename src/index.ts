import {
  HttpAgentRequest,
  Identity,
  PublicKey,
  ReadRequestType,
  requestIdOf,
  Signature,
  SignIdentity,
} from "@dfinity/agent";
import { Linking, Message } from "./types";
import {
  DelegationChain,
  DelegationIdentity,
  ECDSAKeyIdentity,
  isDelegationValid,
} from "@dfinity/identity";
import { Buffer } from "buffer";
import { jsonReplacer, jsonReviver } from "./json";
import { WebLinking, WebMessage } from "./web";
import { Principal } from "@dfinity/principal";
import { base64ToBase64url } from "./utils";

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
  private transformedReadStates: Record<string, unknown> = {};
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
        }
        if ("ok" in data) {
          const { delegationChain, subAccount } = JSON.parse(
            data.ok,
            jsonReviver,
          );
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
              DelegationChain.fromJSON(delegationChain),
              subAccount,
            ),
          );
        }
        listener();
      });
      const url = new URL(origin);
      url.pathname = "/api/v1/connect";
      url.searchParams.set(
        "pubKey",
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
      url.searchParams.set(
        "scopes",
        scopes.map((scope) => scope.toText()).join(","),
      );
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
          return Promise.resolve(transformedReadState);
        }
      }
      throw Error(
        "Invalid request, unable to read state for request not approved by user",
      );
    }

    return new Promise<unknown>(async (resolve, reject) => {
      const id = Buffer.from(await requestIdOf(body)).toString("base64");
      const listener = this.options.message.receive(async (data) => {
        if (data.id !== `v1/sign/${id}`) {
          return;
        }
        if ("err" in data) {
          reject(data.err);
        }
        if ("ok" in data) {
          const { delegationChain, transformedReadState, transformedRequest } =
            JSON.parse(data.ok, jsonReviver);
          if (delegationChain) {
            // If current delegation expires soon, a new delegation is returned by the wallet to replace it
            this.delegationChain = delegationChain;
          }
          if (transformedReadState) {
            this.transformedReadStates[id] = transformedReadState;
          }
          if (transformedRequest) {
            resolve({
              ...fields,
              body: {
                content: body,
                sender_pubkey: this.getPublicKey().toDer(),
                ...transformedRequest,
              },
            });
          }
        }
        listener();
      });
      const requestBuffer = Buffer.from(
        JSON.stringify(body, jsonReplacer),
        "utf8",
      );
      const url = new URL(this.options.origin);
      url.pathname = "/api/v1/sign";
      url.searchParams.set(
        "request",
        base64ToBase64url(requestBuffer.toString("base64")),
      );
      url.searchParams.set(
        "pubKey",
        base64ToBase64url(
          Buffer.from(this.options.identity.getPublicKey().toDer()).toString(
            "base64",
          ),
        ),
      );
      url.searchParams.set(
        "challenge",
        base64ToBase64url(
          Buffer.from(await this.options.identity.sign(requestBuffer)).toString(
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
export * from "./json";
export * from "./utils";
export * from "./web";
