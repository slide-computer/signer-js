var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var _a, _AuthClientTransport_isInternalConstructing, _AuthClientTransport_connection, _AuthClientTransport_authClient;
import { AuthClient } from "@dfinity/auth-client";
import {} from "@slide-computer/signer";
import { AuthClientChannel } from "./authClientChannel.js";
import { AuthClientConnection } from "./authClientConnection.js";
export class AuthClientTransportError extends Error {
    constructor(message) {
        super(message);
        Object.setPrototypeOf(this, AuthClientTransportError.prototype);
    }
}
export class AuthClientTransport {
    constructor(authClient, connection) {
        _AuthClientTransport_connection.set(this, void 0);
        _AuthClientTransport_authClient.set(this, void 0);
        if (!__classPrivateFieldGet(_a, _a, "f", _AuthClientTransport_isInternalConstructing)) {
            throw new AuthClientTransportError("AuthClientTransport is not constructable");
        }
        __classPrivateFieldSet(_a, _a, false, "f", _AuthClientTransport_isInternalConstructing);
        __classPrivateFieldSet(this, _AuthClientTransport_authClient, authClient, "f");
        __classPrivateFieldSet(this, _AuthClientTransport_connection, connection, "f");
    }
    get connection() {
        return __classPrivateFieldGet(this, _AuthClientTransport_connection, "f");
    }
    static async create(options = {}) {
        const authClient = await AuthClient.create(options.authClientCreateOptions);
        const connection = new AuthClientConnection({
            authClient,
            authClientLoginOptions: options.authClientLoginOptions,
            authClientDisconnectMonitoringInterval: options.authClientDisconnectMonitoringInterval,
        });
        __classPrivateFieldSet(_a, _a, true, "f", _AuthClientTransport_isInternalConstructing);
        return new _a(authClient, connection);
    }
    async establishChannel() {
        if (!__classPrivateFieldGet(this, _AuthClientTransport_connection, "f").connected) {
            throw new AuthClientTransportError("AuthClientTransport is not connected");
        }
        return new AuthClientChannel({
            authClient: __classPrivateFieldGet(this, _AuthClientTransport_authClient, "f"),
            connection: __classPrivateFieldGet(this, _AuthClientTransport_connection, "f"),
        });
    }
}
_a = AuthClientTransport, _AuthClientTransport_connection = new WeakMap(), _AuthClientTransport_authClient = new WeakMap();
_AuthClientTransport_isInternalConstructing = { value: false };
//# sourceMappingURL=authClientTransport.js.map