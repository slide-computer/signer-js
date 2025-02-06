const ENCODE_CHUNK_SIZE = 100000;

export const fromBase64 = (base64: string): ArrayBuffer => {
  if (typeof globalThis.Buffer !== "undefined") {
    return globalThis.Buffer.from(base64, "base64").buffer;
  }
  if (typeof globalThis.atob !== "undefined") {
    return Uint8Array.from(globalThis.atob(base64), (m) => m.charCodeAt(0))
      .buffer;
  }
  throw Error("Could not decode base64 string");
};

export const toBase64 = (bytes: ArrayBuffer): string => {
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
