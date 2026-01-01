import type { AuthClient, AuthClientLoginOptions } from "@dfinity/auth-client";
import type { Connection } from "@slide-computer/signer";
interface AuthClientConnectionOptions {
    /**
     * AuthClient instance from "@icp-sdk/core/auth-client"
     */
    authClient: AuthClient;
    /**
     * Login options used to log in with AuthClient instance
     */
    authClientLoginOptions?: AuthClientLoginOptions;
    /**
     * Auth Client disconnect monitoring interval in ms
     * @default 3000
     */
    authClientDisconnectMonitoringInterval?: number;
}
export declare class AuthClientConnection implements Connection {
    #private;
    constructor(options: AuthClientConnectionOptions);
    get connected(): boolean;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    addEventListener(event: "disconnect", listener: () => void): () => void;
}
export {};
