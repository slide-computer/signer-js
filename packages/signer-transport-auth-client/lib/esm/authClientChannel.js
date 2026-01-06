import { NOT_SUPPORTED_ERROR, } from "@slide-computer/signer";
import { AuthClientTransportError } from "./authClientTransport.js";
import { scopes, supportedStandards } from "./constants.js";
export class AuthClientChannel {
    #options;
    #closed = false;
    #closeListeners = new Set();
    #responseListeners = new Set();
    constructor(options) {
        this.#options = options;
        this.#options.connection.addEventListener("disconnect", () => (this.#closed = true));
    }
    get closed() {
        return this.#closed || !this.#options.connection.connected;
    }
    addEventListener(...[event, listener]) {
        switch (event) {
            case "close":
                this.#closeListeners.add(listener);
                return () => {
                    this.#closeListeners.delete(listener);
                };
            case "response":
                this.#responseListeners.add(listener);
                return () => {
                    this.#responseListeners.delete(listener);
                };
        }
    }
    async send(request) {
        if (this.closed) {
            throw new AuthClientTransportError("Communication channel is closed");
        }
        // Ignore one way messages
        if (request.id === undefined) {
            return;
        }
        // Create response and call listeners
        const response = this.#createResponse(request);
        this.#responseListeners.forEach((listener) => listener(response));
    }
    async close() {
        this.#closed = true;
        this.#closeListeners.forEach((listener) => listener());
    }
    #createResponse(request) {
        if (request.id === undefined) {
            throw new AuthClientTransportError("Request is missing id");
        }
        switch (request.method) {
            case "icrc25_supported_standards":
                return {
                    id: request.id,
                    jsonrpc: "2.0",
                    result: { supportedStandards },
                };
            case "icrc25_permissions":
            case "icrc25_request_permissions":
                return {
                    id: request.id,
                    jsonrpc: "2.0",
                    result: { scopes },
                };
            case "icrc34_delegation":
                const identity = this.#options.authClient.getIdentity();
                const delegation = identity.getDelegation();
                return {
                    id: request.id,
                    jsonrpc: "2.0",
                    result: {
                        publicKey: new Uint8Array(delegation.publicKey).toBase64(),
                        signerDelegation: delegation.delegations.map(({ delegation, signature }) => ({
                            delegation: {
                                pubkey: new Uint8Array(delegation.pubkey).toBase64(),
                                expiration: delegation.expiration.toString(),
                                ...(delegation.targets
                                    ? {
                                        targets: delegation.targets.map((target) => target.toText()),
                                    }
                                    : {}),
                            },
                            signature: new Uint8Array(signature).toBase64(),
                        })),
                    },
                };
            default:
                return {
                    id: request.id,
                    jsonrpc: "2.0",
                    error: { code: NOT_SUPPORTED_ERROR, message: "Not supported" },
                };
        }
    }
}
//# sourceMappingURL=authClientChannel.js.map