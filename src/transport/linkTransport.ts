import { JsonRPC, Transport } from "./types";
import { Buffer } from "buffer";

export interface LinkTransportOptions {
  /** Target origin of outgoing messages */
  origin?: string;
  /** Handler for outgoing message urls */
  open?: (url: string) => Promise<void>;
}

type Listener = (data: JsonRPC) => Promise<void>;

type SearchParam = "request" | "response";

export const base64ToBase64url = (value: string) =>
  value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

export const base64urlToBase64 = (value: string) => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return base64 + "=".repeat(base64.length % 4);
};

export class LinkTransport implements Transport {
  private listeners: Listener[] = [];

  constructor(private options: LinkTransportOptions) {}

  public async registerListener<Data extends JsonRPC = JsonRPC>(
    listener: (data: Data) => Promise<void>,
  ): Promise<() => void> {
    this.listeners.push(listener as Listener);
    return () => {
      this.listeners.splice(this.listeners.indexOf(listener as Listener), 1);
    };
  }

  public async send<Data extends JsonRPC = JsonRPC>(
    data: Data,
    param: SearchParam = "request",
  ): Promise<void> {
    if (!this.options.origin) {
      return;
    }
    const searchParams = new URLSearchParams();
    searchParams.set(
      param,
      base64ToBase64url(
        Buffer.from(JSON.stringify(data), "utf8").toString("base64"),
      ),
    );
    await this.options.open?.(
      `${this.options.origin}/rpc?${searchParams.toString()}`,
    );
  }

  public async receive(
    link: string,
    param: SearchParam = "response",
  ): Promise<void> {
    const searchParams = new URLSearchParams(link.slice(link.indexOf("?") + 1));
    const response = searchParams.get(param);
    if (!response) {
      return;
    }
    const data = JSON.parse(
      Buffer.from(base64urlToBase64(response), "base64").toString("utf8"),
    );
    if (
      typeof data !== "object" ||
      !data ||
      !("jsonrpc" in data) ||
      data.jsonrpc !== "2.0"
    ) {
      return;
    }
    await Promise.all(this.listeners.map((listener) => listener(data)));
  }
}
