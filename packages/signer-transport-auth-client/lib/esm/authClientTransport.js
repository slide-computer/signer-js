import { AuthClient } from "@icp-sdk/auth/client";
import { AuthClientChannel } from "./authClientChannel.js";
import { AuthClientConnection } from "./authClientConnection.js";
export class AuthClientTransportError extends Error {
    constructor(message) {
        super(message);
        Object.setPrototypeOf(this, AuthClientTransportError.prototype);
    }
}
export class AuthClientTransport {
    static #isInternalConstructing = false;
    #connection;
    #authClient;
    constructor(authClient, connection) {
        if (!AuthClientTransport.#isInternalConstructing) {
            throw new AuthClientTransportError("AuthClientTransport is not constructable");
        }
        AuthClientTransport.#isInternalConstructing = false;
        this.#authClient = authClient;
        this.#connection = connection;
    }
    get connection() {
        return this.#connection;
    }
    static async create(options = {}) {
        const authClient = await AuthClient.create(options.authClientCreateOptions);
        const connection = new AuthClientConnection({
            authClient,
            authClientLoginOptions: options.authClientLoginOptions,
            authClientDisconnectMonitoringInterval: options.authClientDisconnectMonitoringInterval,
        });
        AuthClientTransport.#isInternalConstructing = true;
        return new AuthClientTransport(authClient, connection);
    }
    async establishChannel() {
        if (!this.#connection.connected) {
            throw new AuthClientTransportError("AuthClientTransport is not connected");
        }
        return new AuthClientChannel({
            authClient: this.#authClient,
            connection: this.#connection,
        });
    }
}
//# sourceMappingURL=authClientTransport.js.map