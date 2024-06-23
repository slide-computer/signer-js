export const fromBase64 = (base64: string): ArrayBuffer => {
  if (typeof globalThis.Buffer !== "undefined") {
    return globalThis.Buffer.from(base64, "base64").buffer;
  }
  if (typeof globalThis.atob !== "undefined") {
    return Uint8Array.from(
      globalThis.atob(base64),
      (m) => m.codePointAt(0) as number,
    ).buffer;
  }
  throw Error("Could not decode base64 string");
};

export const toBase64 = (bytes: ArrayBuffer) => {
  if (typeof globalThis.Buffer !== "undefined") {
    return globalThis.Buffer.from(bytes).toString("base64");
  }
  if (typeof globalThis.btoa !== "undefined") {
    return btoa(String.fromCodePoint(...new Uint8Array(bytes)));
  }
  throw Error("Could not encode base64 string");
};
