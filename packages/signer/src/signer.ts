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
  PermissionScope,
  PermissionsRequest,
  PermissionsResponse,
  PermissionState,
  RequestPermissionsRequest,
  RequestPermissionsResponse,
  SupportedStandard,
  SupportedStandardsRequest,
  SupportedStandardsResponse,
} from "./icrc25";
import type {
  AccountsPermissionScope,
  AccountsRequest,
  AccountsResponse,
} from "./icrc27";
import type {
  DelegationPermissionScope,
  DelegationRequest,
  DelegationResponse,
} from "./icrc34";
import type {
  CallCanisterPermissionScope,
  CallCanisterRequest,
  CallCanisterResponse,
} from "./icrc49";
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
  | AccountsPermissionScope
  | DelegationPermissionScope
  | CallCanisterPermissionScope;

export type SignerOptions = {
  /**
   * The transport used to send and receive messages
   */
  transport: Transport;
  /**
   * Automatically close transport channel after response has been received
   * @default true
   */
  autoCloseTransportChannel?: boolean;
  /**
   * Close transport channel after a given duration in ms
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
  #options: Required<SignerOptions>;
  #channel?: Channel;
  #establishingChannel?: Promise<void>;
  #scheduledChannelClosure?: number;

  constructor(options: SignerOptions) {
    this.#options = {
      autoCloseTransportChannel: true,
      closeTransportChannelAfter: 200,
      crypto: globalThis.crypto,
      ...options,
    };
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

  async sendRequest<T extends JsonRequest, S extends JsonResponse>(
    request: T,
  ): Promise<JsonResponseResult<S>> {
    return new Promise<JsonResponseResult<S>>(async (resolve, reject) => {
      // Establish new or re-use existing transport channel
      const channel = await this.openChannel();

      // Listen on transport channel for incoming response
      const responseListener = channel.addEventListener(
        "response",
        async (response) => {
          if (response.id !== request.id) {
            // Ignore responses that don't match the request id
            return;
          }

          // Stop listening to events once a valid response has been received
          responseListener();
          closeListener();

          // Reject or resolve based on response value
          if ("error" in response) {
            reject(new SignerError(response.error));
          }
          if ("result" in response) {
            resolve(response.result as JsonResponseResult<S>);
          }

          // Close transport channel after a certain timeout
          if (this.#options.autoCloseTransportChannel) {
            this.#scheduledChannelClosure = setTimeout(() => {
              if (!channel.closed) {
                channel.close();
              }
            }, this.#options.closeTransportChannelAfter);
          }
        },
      );

      // Monitor if channel is closed before a response has been received
      const closeListener = channel.addEventListener("close", () => {
        // Stop listening to events once a channel is closed
        responseListener();
        closeListener();

        // Throw error if channel is closed before response is received
        reject(
          new SignerError({
            code: NETWORK_ERROR,
            message: "Channel was closed before a response was received",
          }),
        );
      });

      // Send outgoing request over transport channel
      try {
        await channel.send(request);
      } catch (error) {
        responseListener();
        closeListener();
        reject(wrapChannelError(error));
      }
    });
  }

  async supportedStandards(): Promise<SupportedStandard[]> {
    const response = await this.sendRequest<
      SupportedStandardsRequest,
      SupportedStandardsResponse
    >({
      id: this.#options.crypto.randomUUID(),
      jsonrpc: "2.0",
      method: "icrc25_supported_standards",
    });
    return response.supportedStandards;
  }

  async requestPermissions(
    scopes: SignerPermissionScope[],
  ): Promise<Array<{ scope: SignerPermissionScope; state: PermissionState }>> {
    const response = await this.sendRequest<
      RequestPermissionsRequest,
      RequestPermissionsResponse
    >({
      id: this.#options.crypto.randomUUID(),
      jsonrpc: "2.0",
      method: "icrc25_request_permissions",
      params: { scopes },
    });
    return response.scopes;
  }

  async permissions(): Promise<
    Array<{ scope: SignerPermissionScope; state: PermissionState }>
  > {
    const response = await this.sendRequest<
      PermissionsRequest,
      PermissionsResponse
    >({
      id: this.#options.crypto.randomUUID(),
      jsonrpc: "2.0",
      method: "icrc25_permissions",
    });
    return response.scopes;
  }

  async accounts(): Promise<
    Array<{ owner: Principal; subaccount?: ArrayBuffer }>
  > {
    const response = await this.sendRequest<AccountsRequest, AccountsResponse>({
      id: this.#options.crypto.randomUUID(),
      jsonrpc: "2.0",
      method: "icrc27_accounts",
    });
    return response.accounts.map(({ owner, subaccount }) => ({
      owner: Principal.fromText(owner),
      subaccount:
        subaccount === undefined
          ? undefined
          : Buffer.from(subaccount, "base64").buffer,
    }));
  }

  async delegation(params: {
    publicKey: ArrayBuffer;
    targets?: Principal[];
    maxTimeToLive?: bigint;
  }): Promise<DelegationChain> {
    const response = await this.sendRequest<
      DelegationRequest,
      DelegationResponse
    >({
      id: this.#options.crypto.randomUUID(),
      jsonrpc: "2.0",
      method: "icrc34_delegation",
      params: {
        publicKey: Buffer.from(params.publicKey).toString("base64"),
        targets: params.targets?.map((p) => p.toText()),
        maxTimeToLive:
          params.maxTimeToLive === undefined
            ? undefined
            : String(params.maxTimeToLive),
      },
    });
    return DelegationChain.fromDelegations(
      response.signerDelegation.map((delegation) => ({
        delegation: new Delegation(
          Buffer.from(delegation.delegation.pubkey, "base64").buffer,
          BigInt(delegation.delegation.expiration),
          delegation.delegation.targets?.map((principal) =>
            Principal.fromText(principal),
          ),
        ),
        signature: Buffer.from(delegation.signature, "base64")
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
  }): Promise<{ contentMap: ArrayBuffer; certificate: ArrayBuffer }> {
    const response = await this.sendRequest<
      CallCanisterRequest,
      CallCanisterResponse
    >({
      id: this.#options.crypto.randomUUID(),
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
