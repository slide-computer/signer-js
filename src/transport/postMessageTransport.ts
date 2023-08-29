import { JsonRequest, JsonResponse, Transport } from "../types";

export interface PostMessageTransportOptions {
  target: Pick<Window, "postMessage">;
  origin: string;
}

export class PostMessageTransport implements Transport {
  constructor(private options: PostMessageTransportOptions) {}

  public async registerListener<Response extends JsonResponse = JsonResponse>(
    listener: (response: Response) => Promise<void>,
  ): Promise<() => void> {
    const messageListener = async (event: MessageEvent) => {
      if (
        event.origin !== this.options.origin ||
        typeof event.data !== "object" ||
        !event.data ||
        !("jsonrpc" in event.data) ||
        event.data.jsonrpc !== "2.0"
      ) {
        return;
      }
      await listener(event.data);
    };
    window.addEventListener("message", messageListener);
    return () => {
      window.removeEventListener("message", messageListener);
    };
  }

  public async send<Request extends JsonRequest = JsonRequest>(
    request: Request,
  ): Promise<void> {
    this.options.target.postMessage(request, this.options.origin);
  }
}
