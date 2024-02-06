import { JsonRequest, JsonResponse, JsonRPC, Transport } from "./types";
import { Buffer } from "buffer";

export interface LinkTransportOptions {
  /** Target origin of outgoing messages */
  origin?: string;
  /** Handler for outgoing message urls */
  open?: (url: string) => Promise<void>;
}

type Listener = (data: JsonRPC[]) => Promise<void>;

type SearchParam = "requests" | "responses";

export const base64ToBase64url = (value: string) =>
  value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

export const base64urlToBase64 = (value: string) => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return base64 + "=".repeat(base64.length % 4);
};

export class LinkTransport implements Transport {
  private listeners: Listener[] = [];

  constructor(private options: LinkTransportOptions) {}

  public async registerListener(
    listener: (responses: JsonResponse[]) => Promise<void>,
  ): Promise<() => void> {
    this.listeners.push(listener as Listener);
    return () => {
      this.listeners.splice(this.listeners.indexOf(listener as Listener), 1);
    };
  }

  public async send(
    requests: JsonRequest[],
    param: SearchParam = "requests",
  ): Promise<void> {
    if (!this.options.origin) {
      return;
    }
    const searchParams = new URLSearchParams();
    searchParams.set(
      param,
      base64ToBase64url(
        Buffer.from(JSON.stringify(requests), "utf8").toString("base64"),
      ),
    );
    await this.options.open?.(
      `${this.options.origin}/rpc?${searchParams.toString()}`,
    );
  }

  public async receive(
    link: string,
    param: SearchParam = "responses",
  ): Promise<void> {
    const searchParams = new URLSearchParams(link.slice(link.indexOf("?") + 1));
    const value = searchParams.get(param);
    if (!value) {
      return;
    }
    const responses = JSON.parse(
      Buffer.from(base64urlToBase64(value), "base64").toString("utf8"),
    );
    if (
      !Array.isArray(responses) ||
      responses.some(
        (response) =>
          typeof response !== "object" ||
          !response ||
          !("jsonrpc" in response) ||
          response.jsonrpc !== "2.0",
      )
    ) {
      return;
    }
    await Promise.all(this.listeners.map((listener) => listener(responses)));
  }
}
