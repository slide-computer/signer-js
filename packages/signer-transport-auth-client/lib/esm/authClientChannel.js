var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _AuthClientChannel_instances, _AuthClientChannel_options, _AuthClientChannel_closed, _AuthClientChannel_closeListeners, _AuthClientChannel_responseListeners, _AuthClientChannel_createResponse;
import { NOT_SUPPORTED_ERROR, toBase64, } from "@slide-computer/signer";
import { AuthClientTransportError } from "./authClientTransport.js";
import { scopes, supportedStandards } from "./constants.js";
export class AuthClientChannel {
    constructor(options) {
        _AuthClientChannel_instances.add(this);
        _AuthClientChannel_options.set(this, void 0);
        _AuthClientChannel_closed.set(this, false);
        _AuthClientChannel_closeListeners.set(this, new Set());
        _AuthClientChannel_responseListeners.set(this, new Set());
        __classPrivateFieldSet(this, _AuthClientChannel_options, options, "f");
        __classPrivateFieldGet(this, _AuthClientChannel_options, "f").connection.addEventListener("disconnect", () => (__classPrivateFieldSet(this, _AuthClientChannel_closed, true, "f")));
    }
    get closed() {
        return __classPrivateFieldGet(this, _AuthClientChannel_closed, "f") || !__classPrivateFieldGet(this, _AuthClientChannel_options, "f").connection.connected;
    }
    addEventListener(...[event, listener]) {
        switch (event) {
            case "close":
                __classPrivateFieldGet(this, _AuthClientChannel_closeListeners, "f").add(listener);
                return () => {
                    __classPrivateFieldGet(this, _AuthClientChannel_closeListeners, "f").delete(listener);
                };
            case "response":
                __classPrivateFieldGet(this, _AuthClientChannel_responseListeners, "f").add(listener);
                return () => {
                    __classPrivateFieldGet(this, _AuthClientChannel_responseListeners, "f").delete(listener);
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
        const response = __classPrivateFieldGet(this, _AuthClientChannel_instances, "m", _AuthClientChannel_createResponse).call(this, request);
        __classPrivateFieldGet(this, _AuthClientChannel_responseListeners, "f").forEach((listener) => listener(response));
    }
    async close() {
        __classPrivateFieldSet(this, _AuthClientChannel_closed, true, "f");
        __classPrivateFieldGet(this, _AuthClientChannel_closeListeners, "f").forEach((listener) => listener());
    }
}
_AuthClientChannel_options = new WeakMap(), _AuthClientChannel_closed = new WeakMap(), _AuthClientChannel_closeListeners = new WeakMap(), _AuthClientChannel_responseListeners = new WeakMap(), _AuthClientChannel_instances = new WeakSet(), _AuthClientChannel_createResponse = function _AuthClientChannel_createResponse(request) {
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
            const identity = __classPrivateFieldGet(this, _AuthClientChannel_options, "f").authClient.getIdentity();
            const delegation = identity.getDelegation();
            return {
                id: request.id,
                jsonrpc: "2.0",
                result: {
                    publicKey: toBase64(new Uint8Array(delegation.publicKey)),
                    signerDelegation: delegation.delegations.map(({ delegation, signature }) => ({
                        delegation: Object.assign({ pubkey: toBase64(new Uint8Array(delegation.pubkey)), expiration: delegation.expiration.toString() }, (delegation.targets
                            ? {
                                targets: delegation.targets.map((target) => target.toText()),
                            }
                            : {})),
                        signature: toBase64(new Uint8Array(signature)),
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
};
//# sourceMappingURL=authClientChannel.js.map