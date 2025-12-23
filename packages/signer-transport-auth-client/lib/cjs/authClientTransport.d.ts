import { AuthClient, type AuthClientLoginOptions } from "@dfinity/auth-client";
import { type Channel, type Connection, type Transport } from "@slide-computer/signer";
export declare class AuthClientTransportError extends Error {
    constructor(message: string);
}
type AuthClientCreateOptions = Parameters<typeof AuthClient.create>[0];
export interface AuthClientTransportOptions {
    /**
     * Options used to create AuthClient instance
     */
    authClientCreateOptions?: AuthClientCreateOptions;
    /**
     * Options used to log in with AuthClient instance
     */
    authClientLoginOptions?: AuthClientLoginOptions;
    /**
     * Auth Client disconnect monitoring interval in ms
     * @default 3000
     */
    authClientDisconnectMonitoringInterval?: number;
}
export declare class AuthClientTransport implements Transport {
    #private;
    private constructor();
    get connection(): Connection;
    static create(options: AuthClientTransportOptions): Promise<AuthClientTransport>;
    establishChannel(): Promise<Channel>;
}
export {};
