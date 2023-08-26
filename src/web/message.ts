import { Message, MessageData } from "../types";
import { SLIDE_ORIGIN } from "../index";

export interface WebMessageOptions {
  origin?: string;
}

export class WebMessage implements Message {
  private readonly options: Required<WebMessageOptions>;

  constructor(options?: WebMessageOptions) {
    this.options = {
      ...options,
      origin: options?.origin ?? SLIDE_ORIGIN,
    };
  }

  receive(listener: (data: MessageData) => void): () => void {
    const eventListener = (e: MessageEvent) => {
      if (e.origin !== this.options.origin) {
        return;
      }
      if (
        !e.data ||
        typeof e.data !== "object" ||
        !("id" in e.data) ||
        !("ok" in e.data || "err" in e.data)
      ) {
        throw Error("Invalid data received");
      }
      listener(e.data);
    };
    window.addEventListener("message", eventListener);
    return () => {
      window.removeEventListener("message", eventListener);
    };
  }
}
