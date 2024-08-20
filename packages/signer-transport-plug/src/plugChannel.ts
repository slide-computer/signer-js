import {type Channel, type JsonRequest, type JsonResponse,} from "@slide-computer/signer";
import {PlugTransportError} from "./plugTransport";

export class PlugChannel implements Channel {
  readonly #responseListeners = new Set<(response: JsonResponse) => void>();

  get closed(): boolean {
    return !('ic' in window)
      || typeof window.ic !== 'object'
      || !window.ic
      || !("plug" in window.ic)
      || typeof window.ic.plug !== 'object'
      || !window.ic.plug
      || !('request' in window.ic.plug)
      || typeof window.ic.plug.request !== 'function'
  }

  addEventListener(
    ...[event, listener]:
      | [event: "close", listener: () => void]
      | [event: "response", listener: (response: JsonResponse) => void]
  ): () => void {
    switch (event) {
      case "close":
        return () => {
        };
      case "response":
        this.#responseListeners.add(listener);
        return () => {
          this.#responseListeners.delete(listener);
        };
    }
  }

  async send(request: JsonRequest): Promise<void> {
    if (this.closed) throw new PlugTransportError("Plug wallet cannot be found");

    // @ts-ignore Call plug window method
    const response = await window.ic.plug.request(request);

    // One way messages, don't have a response
    if (request.id === undefined) return;

    // Call listeners with response
    this.#responseListeners.forEach((listener) => listener(response));
  }

  async close(): Promise<void> {
  }
}
