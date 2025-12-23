"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthClientChannel = void 0;
const signer_1 = require("@slide-computer/signer");
const authClientTransport_1 = require("./authClientTransport");
const constants_1 = require("./constants");
const identity_1 = require("@dfinity/identity");
class AuthClientChannel {
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
            throw new authClientTransport_1.AuthClientTransportError("Communication channel is closed");
        }
        // Ignore one way messages
        const id = request.id;
        if (id === undefined) {
            return;
        }
        // Create response and call listeners
        const response = await __classPrivateFieldGet(this, _AuthClientChannel_instances, "m", _AuthClientChannel_createResponse).call(this, Object.assign({ id }, request));
        __classPrivateFieldGet(this, _AuthClientChannel_responseListeners, "f").forEach((listener) => listener(response));
    }
    async close() {
        __classPrivateFieldSet(this, _AuthClientChannel_closed, true, "f");
        __classPrivateFieldGet(this, _AuthClientChannel_closeListeners, "f").forEach((listener) => listener());
    }
}
exports.AuthClientChannel = AuthClientChannel;
_AuthClientChannel_options = new WeakMap(), _AuthClientChannel_closed = new WeakMap(), _AuthClientChannel_closeListeners = new WeakMap(), _AuthClientChannel_responseListeners = new WeakMap(), _AuthClientChannel_instances = new WeakSet(), _AuthClientChannel_createResponse = async function _AuthClientChannel_createResponse(request) {
    const id = request.id;
    if (!(0, signer_1.isJsonRpcRequest)(request)) {
        return {
            id,
            jsonrpc: "2.0",
            error: { code: signer_1.INVALID_REQUEST_ERROR, message: "Invalid request" },
        };
    }
    switch (request.method) {
        case "icrc25_supported_standards":
            return {
                id,
                jsonrpc: "2.0",
                result: { supportedStandards: constants_1.supportedStandards },
            };
        case "icrc25_permissions":
        case "icrc25_request_permissions":
            return {
                id,
                jsonrpc: "2.0",
                result: { scopes: constants_1.scopes },
            };
        case "icrc34_delegation":
            // As per the ICRC-34 spec, II only returns unscoped Relying Party delegations (without targets).
            const delegationRequest = request;
            if (!delegationRequest.params) {
                throw new authClientTransport_1.AuthClientTransportError("Required params missing in request");
            }
            const identity = __classPrivateFieldGet(this, _AuthClientChannel_options, "f").authClient.getIdentity();
            const publicKey = (0, signer_1.fromBase64)(delegationRequest.params.publicKey);
            const expiration = delegationRequest.params.maxTimeToLive
                ? new Date(Date.now() +
                    Number(BigInt(delegationRequest.params.maxTimeToLive) /
                        BigInt(1000000)))
                : undefined;
            const delegation = await identity_1.DelegationChain.create(identity, { toDer: () => publicKey }, expiration, {
                previous: identity.getDelegation(),
            });
            return {
                id,
                jsonrpc: "2.0",
                result: {
                    publicKey: (0, signer_1.toBase64)(delegation.publicKey),
                    signerDelegation: delegation.delegations.map(({ delegation, signature }) => ({
                        delegation: Object.assign({ pubkey: (0, signer_1.toBase64)(delegation.pubkey), expiration: delegation.expiration.toString() }, (delegation.targets
                            ? {
                                targets: delegation.targets.map((target) => target.toText()),
                            }
                            : {})),
                        signature: (0, signer_1.toBase64)(signature),
                    })),
                },
            };
        default:
            return {
                id,
                jsonrpc: "2.0",
                error: { code: signer_1.NOT_SUPPORTED_ERROR, message: "Not supported" },
            };
    }
};
//# sourceMappingURL=authClientChannel.js.map