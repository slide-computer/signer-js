/**
 * Hex encoding/decoding utilities
 * These were previously in @dfinity/agent but removed in @icp-sdk/core
 */

/**
 * Converts a hex string to a Uint8Array
 */
export const fromHex = (hex: string): Uint8Array => {
  const match = hex.match(/.{1,2}/g);
  if (!match) {
    return new Uint8Array(0);
  }
  return new Uint8Array(match.map((byte) => parseInt(byte, 16)));
};

/**
 * Converts an ArrayBuffer or Uint8Array to a hex string
 */
export const toHex = (buffer: ArrayBuffer | Uint8Array): string => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};
