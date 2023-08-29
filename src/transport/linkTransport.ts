import { JsonRequest, JsonResponse, Transport } from "../types";

export interface LinkTransportOptions {
  origin: string;
  open: (url: string) => Promise<void>;
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
    const url = new URL(this.options.origin);
    url.pathname = "/rpc";
    url.searchParams.set("request", JSON.stringify(request));
    await this.options.open(url.toString());
  }

  public async receive(link: string): Promise<void> {
    const url = new URL(link);
    if (url.pathname !== "/rpc") {
      return;
    }
    const response = url.searchParams.get("response");
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
