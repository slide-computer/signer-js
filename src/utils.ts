const ENCODE_CHUNK_SIZE = 100000;

export const fromBase64 = (base64: string): Uint8Array => {
  if (
    "fromBase64" in Uint8Array &&
    typeof Uint8Array.fromBase64 === "function"
  ) {
    return Uint8Array.fromBase64(base64);
  }
  if (typeof globalThis.Buffer !== "undefined") {
    return globalThis.Buffer.from(base64, "base64");
  }
  if (typeof globalThis.atob !== "undefined") {
    return Uint8Array.from(globalThis.atob(base64), (m) => m.charCodeAt(0));
  }
  throw Error("Could not decode base64 string");
};

export const toBase64 = (bytes: Uint8Array): string => {
  if ("toBase64" in bytes && typeof bytes.toBase64 === "function") {
    return bytes.toBase64();
  }
  if (typeof globalThis.Buffer !== "undefined") {
    return globalThis.Buffer.from(bytes).toString("base64");
  }
  if (typeof globalThis.btoa !== "undefined") {
    return btoa(
      Array.from({ length: Math.ceil(bytes.byteLength / ENCODE_CHUNK_SIZE) })
        .map((_, index) =>
          String.fromCharCode(
            ...new Uint8Array(
              bytes.slice(
                index * ENCODE_CHUNK_SIZE,
                (index + 1) * ENCODE_CHUNK_SIZE,
              ),
            ),
          ),
        )
        .join(""),
    );
  }
  throw Error("Could not encode base64 string");
};

export const fromHex = (hex: string): Uint8Array => {
  if ("fromHex" in Uint8Array && typeof Uint8Array.fromHex === "function") {
    return Uint8Array.fromHex(hex);
  }
  if (typeof globalThis.Buffer !== "undefined") {
    return globalThis.Buffer.from(hex, "hex");
  }
  return new Uint8Array(
    Array.from({ length: hex.length / 2 }, (_, i) =>
      parseInt(hex.slice(i * 2, i * 2 + 2), 16),
    ),
  );
};

export const toHex = (bytes: Uint8Array): string => {
  if ("toHex" in bytes && typeof bytes.toHex === "function") {
    return bytes.toHex();
  }
  if (typeof globalThis.Buffer !== "undefined") {
    return globalThis.Buffer.from(bytes).toString("hex");
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};
