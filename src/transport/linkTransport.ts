import { JsonRequest, JsonResponse, Transport } from "../types";

export interface LinkTransportOptions {
  /** Target origin of outgoing messages */
  origin?: string;
  /** Handler for outgoing message urls */
  open?: (url: string) => Promise<void>;
}

type Listener = (response: JsonResponse) => Promise<void>;

export class LinkTransport implements Transport {
  private listeners: Listener[] = [];

  constructor(private options: LinkTransportOptions) {}

  public async registerListener<Response extends JsonResponse = JsonResponse>(
    listener: (response: Response) => Promise<void>,
  ): Promise<() => void> {
    this.listeners.push(listener as Listener);
    return () => {
      this.listeners.splice(this.listeners.indexOf(listener as Listener), 1);
    };
  }

  public async send<Request extends JsonRequest = JsonRequest>(
    request: Request,
  ): Promise<void> {
    if (!this.options.origin) {
      return;
    }
    const searchParams = new URLSearchParams();
    searchParams.set("request", JSON.stringify(request));
    await this.options.open?.(`${origin}/rpc?${searchParams.toString()}`);
  }

  public async receive(link: string): Promise<void> {
    const searchParams = new URLSearchParams(link.slice(link.indexOf("?") + 1));
    const response = searchParams.get("response");
    if (!response) {
      return;
    }
    const data = JSON.parse(response);
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
