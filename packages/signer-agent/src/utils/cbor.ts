import borc from "borc";
import { concat } from "@dfinity/agent";

class Uint8ArrayDecoder extends borc.Decoder {
  public createByteString(raw: ArrayBuffer[]): ArrayBuffer {
    return concat(...raw);
  }

  public createByteStringFromHeap(start: number, end: number): ArrayBuffer {
    if (start === end) {
      return new ArrayBuffer(0);
    }

    return new Uint8Array((this as any)._heap.slice(start, end));
  }
}

const decodePositiveBigInt = (buf: Uint8Array): bigint => {
  const len = buf.byteLength;
  let res = BigInt(0);
  for (let i = 0; i < len; i++) {
    // tslint:disable-next-line:no-bitwise
    res = res * BigInt(0x100) + BigInt(buf[i]);
  }
  return res;
};

const decodeU64 = (buf: Uint8Array): bigint =>
  BigInt(
    parseInt(
      Array.from(buf)
        .map((byte) => byte.toString(16))
        .join(""),
      16,
    ),
  );

export const decode = <T>(input: ArrayBuffer): T => {
  const buffer = new Uint8Array(input);
  const decoder = new Uint8ArrayDecoder({
    size: buffer.byteLength,
    tags: {
      // Override tags 2 and 3 for BigInt support (borc supports only BigNumber).
      2: (val) => decodePositiveBigInt(val),
      3: (val) => -decodePositiveBigInt(val),
      27: (val) => decodeU64(val), // Decode e.g. u64 expiry in content map
      55799: (value: T): T => value,
    },
  });
  return decoder.decodeFirst(buffer);
};
