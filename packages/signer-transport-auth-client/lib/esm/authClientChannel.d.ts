import type { AuthClient } from "@dfinity/auth-client";
import { type Channel, type Connection, type JsonRequest, type JsonResponse } from "@slide-computer/signer";
export interface AuthClientChannelOptions {
    /**
     * AuthClient instance from "@icp-sdk/core/auth-client"
     */
    authClient: AuthClient;
    /**
     * AuthClientTransport connection, used to close channel once connection is closed
     */
    connection: Connection;
}
export declare class AuthClientChannel implements Channel {
    #private;
    constructor(options: AuthClientChannelOptions);
    get closed(): boolean;
    addEventListener(...[event, listener]: [event: "close", listener: () => void] | [event: "response", listener: (response: JsonResponse) => void]): () => void;
    send(request: JsonRequest): Promise<void>;
    close(): Promise<void>;
}
