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
var _AuthClientConnection_instances, _AuthClientConnection_options, _AuthClientConnection_disconnectListeners, _AuthClientConnection_disconnectMonitorInterval, _AuthClientConnection_monitorDisconnect;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthClientConnection = void 0;
const authClientTransport_1 = require("./authClientTransport");
const identity_1 = require("@dfinity/identity");
class AuthClientConnection {
    constructor(options) {
        _AuthClientConnection_instances.add(this);
        _AuthClientConnection_options.set(this, void 0);
        _AuthClientConnection_disconnectListeners.set(this, new Set());
        _AuthClientConnection_disconnectMonitorInterval.set(this, void 0);
        __classPrivateFieldSet(this, _AuthClientConnection_options, Object.assign({ authClientLoginOptions: {}, authClientDisconnectMonitoringInterval: 3000 }, options), "f");
        if (this.connected) {
            __classPrivateFieldGet(this, _AuthClientConnection_instances, "m", _AuthClientConnection_monitorDisconnect).call(this);
        }
    }
    get connected() {
        const identity = __classPrivateFieldGet(this, _AuthClientConnection_options, "f").authClient.getIdentity();
        if (identity.getPrincipal().isAnonymous()) {
            return false;
        }
        const delegationIdentity = identity;
        return (0, identity_1.isDelegationValid)(delegationIdentity.getDelegation());
    }
    async connect() {
        return new Promise((resolve, reject) => {
            __classPrivateFieldGet(this, _AuthClientConnection_options, "f").authClient.login(Object.assign(Object.assign({}, __classPrivateFieldGet(this, _AuthClientConnection_options, "f").authClientLoginOptions), { onSuccess: () => {
                    __classPrivateFieldGet(this, _AuthClientConnection_instances, "m", _AuthClientConnection_monitorDisconnect).call(this);
                    resolve();
                }, onError: (error) => reject(new authClientTransport_1.AuthClientTransportError(error !== null && error !== void 0 ? error : "AuthClient login failed")) }));
        });
    }
    async disconnect() {
        clearInterval(__classPrivateFieldGet(this, _AuthClientConnection_disconnectMonitorInterval, "f"));
        await __classPrivateFieldGet(this, _AuthClientConnection_options, "f").authClient.logout();
        __classPrivateFieldGet(this, _AuthClientConnection_disconnectListeners, "f").forEach((listener) => listener());
    }
    addEventListener(event, listener) {
        switch (event) {
            case "disconnect":
                __classPrivateFieldGet(this, _AuthClientConnection_disconnectListeners, "f").add(listener);
                return () => {
                    __classPrivateFieldGet(this, _AuthClientConnection_disconnectListeners, "f").delete(listener);
                };
        }
    }
}
exports.AuthClientConnection = AuthClientConnection;
_AuthClientConnection_options = new WeakMap(), _AuthClientConnection_disconnectListeners = new WeakMap(), _AuthClientConnection_disconnectMonitorInterval = new WeakMap(), _AuthClientConnection_instances = new WeakSet(), _AuthClientConnection_monitorDisconnect = function _AuthClientConnection_monitorDisconnect() {
    __classPrivateFieldSet(this, _AuthClientConnection_disconnectMonitorInterval, setInterval(() => {
        if (!this.connected) {
            __classPrivateFieldGet(this, _AuthClientConnection_disconnectListeners, "f").forEach((listener) => listener());
            clearInterval(__classPrivateFieldGet(this, _AuthClientConnection_disconnectMonitorInterval, "f"));
        }
    }, __classPrivateFieldGet(this, _AuthClientConnection_options, "f").authClientDisconnectMonitoringInterval), "f");
};
//# sourceMappingURL=authClientConnection.js.map