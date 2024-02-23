import { BatchTransport, JsonRequest, JsonResponse, JsonRPC } from "./types";
import { Buffer } from "buffer";
import { isJsonRpcResponse } from "./utils";

export interface LinkTransportOptions {
  /** Target origin of outgoing messages */
  origin: string;
  /** Target endpoint of outgoing messages */
  endpoint: string;
  /** Handler for outgoing message urls */
  open?: (url: string) => Promise<void>;
}

type Listener = (data: JsonRPC) => Promise<void>;

export const base64ToBase64url = (value: string) =>
  value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

export const base64urlToBase64 = (value: string) => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return base64 + "=".repeat(base64.length % 4);
};

export class LinkTransportError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, LinkTransportError.prototype);
  }
}

export class LinkTransport implements BatchTransport {
  private listeners: Listener[] = [];
  private queue: JsonRequest[] = [];

  constructor(private options: LinkTransportOptions) {}

  public async registerListener(
    listener: (responses: JsonResponse) => Promise<void>,
  ): Promise<() => void> {
    this.listeners.push(listener as Listener);
    return () => {
      this.listeners.splice(this.listeners.indexOf(listener as Listener), 1);
    };
  }

  public async send(request: JsonRequest): Promise<void> {
    this.queue.push(request);
  }

  public async receive(link: string): Promise<void> {
    const searchParams = new URLSearchParams(link.slice(link.indexOf("?") + 1));
    const value = searchParams.get("messages");
    if (!value) {
      return;
    }
    const responses = JSON.parse(
      Buffer.from(base64urlToBase64(value), "base64").toString("utf8"),
    );
    if (!Array.isArray(responses) || !responses.every(isJsonRpcResponse)) {
      return;
    }
    await Promise.all(
      responses.flatMap((response) =>
        this.listeners.map((listener) => listener(response)),
      ),
    );
  }

  public async execute(): Promise<void> {
    if (!this.options.origin) {
      throw new LinkTransportError("Origin is required in options to send");
    }
    const searchParams = new URLSearchParams();
    searchParams.set(
      "messages",
      base64ToBase64url(
        Buffer.from(JSON.stringify(this.queue), "utf8").toString("base64"),
      ),
    );
    this.queue = [];
    await (this.options.open ?? window.open)(
      `${this.options.origin}${this.options.endpoint}?${searchParams.toString()}`,
    );
  }
}
