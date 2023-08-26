import { Principal } from "@dfinity/principal";
import { Expiry } from "@dfinity/agent";

const jsonTypeSep = "879f2cfbf89d46749c35de8e7a465a03"; // Random UUID to limit chance of conflict
export const jsonReplacer = (key: string, value: any) => {
  if (typeof value === "bigint") {
    return ["bigint", jsonTypeSep, String(value)].join("");
  }
  if (value instanceof Principal) {
    return ["Principal", jsonTypeSep, value.toText()].join("");
  }
  if (value instanceof Uint8Array) {
    return [
      "Uint8Array",
      jsonTypeSep,
      Buffer.from(value).toString("base64"),
    ].join("");
  }
  if (value instanceof ArrayBuffer) {
    return [
      "ArrayBuffer",
      jsonTypeSep,
      Buffer.from(value).toString("base64"),
    ].join("");
  }
  if (value instanceof Expiry) {
    // @ts-ignore There's no public way to serialize Expiry class
    return ["Expiry", jsonTypeSep, `${value._value}`].join("");
  }
  return value;
};

export const jsonReviver = (key: string, value: any) => {
  if (typeof value === "string" && value.includes(jsonTypeSep)) {
    const [type, rawValue] = value.split(jsonTypeSep);
    switch (type) {
      case "bigint":
        return BigInt(rawValue);
      case "Principal":
        return Principal.fromText(rawValue);
      case "Uint8Array":
        return Uint8Array.from(Buffer.from(rawValue, "base64"));
      case "ArrayBuffer":
        return Buffer.from(rawValue, "base64").buffer;
      case "Expiry":
        const expiry = new Expiry(0);
        // @ts-ignore There's no public way to deserialize Expiry class
        expiry._value = BigInt(rawValue);
        return expiry;
    }
  }
  return value;
};
