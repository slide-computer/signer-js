import { isDelegationValid } from "@icp-sdk/core/identity";
import { AuthClientTransportError } from "./authClientTransport.js";
export class AuthClientConnection {
    #options;
    #disconnectListeners = new Set();
    #disconnectMonitorInterval;
    constructor(options) {
        this.#options = {
            authClientLoginOptions: {},
            authClientDisconnectMonitoringInterval: 3000,
            ...options,
        };
        if (this.connected) {
            this.#monitorDisconnect();
        }
    }
    get connected() {
        const identity = this.#options.authClient.getIdentity();
        if (identity.getPrincipal().isAnonymous()) {
            return false;
        }
        const delegationIdentity = identity;
        return isDelegationValid(delegationIdentity.getDelegation());
    }
    async connect() {
        return new Promise((resolve, reject) => {
            this.#options.authClient.login({
                ...this.#options.authClientLoginOptions,
                onSuccess: () => {
                    this.#monitorDisconnect();
                    resolve();
                },
                onError: (error) => reject(new AuthClientTransportError(error ?? "AuthClient login failed")),
            });
        });
    }
    async disconnect() {
        clearInterval(this.#disconnectMonitorInterval);
        await this.#options.authClient.logout();
        this.#disconnectListeners.forEach((listener) => listener());
    }
    addEventListener(event, listener) {
        switch (event) {
            case "disconnect":
                this.#disconnectListeners.add(listener);
                return () => {
                    this.#disconnectListeners.delete(listener);
                };
        }
    }
    #monitorDisconnect() {
        this.#disconnectMonitorInterval = setInterval(() => {
            if (!this.connected) {
                this.#disconnectListeners.forEach((listener) => listener());
                clearInterval(this.#disconnectMonitorInterval);
            }
        }, this.#options.authClientDisconnectMonitoringInterval);
    }
}
//# sourceMappingURL=authClientConnection.js.map