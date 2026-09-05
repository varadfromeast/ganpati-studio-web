const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IHDR = Uint8Array.from([0x49, 0x48, 0x44, 0x52]);

export const MAXIMUM_SOURCE_PNG_DIMENSION = 4_096;
export const MAXIMUM_SOURCE_PNG_PIXELS = 8_000_000;

export type PNGValidationFailure = "unsupported" | "incomplete" | "dimensions";

export class PNGValidationError extends Error {
  constructor(readonly failure: PNGValidationFailure) {
    super(`PNG validation failed: ${failure}.`);
    this.name = "PNGValidationError";
  }
}

/**
 * Reads the mandatory first PNG chunk and bounds decoded pixel cost before any
 * image decoder, model provider, or FFmpeg process sees untrusted bytes.
 */
export function validateSourcePNG(bytes: Uint8Array): { width: number; height: number } {
  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    throw new PNGValidationError("unsupported");
  }
  // Signature (8) + IHDR length/type (8) + IHDR data (13) + CRC (4).
  if (bytes.byteLength < 33) throw new PNGValidationError("incomplete");

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ihdrLength = view.getUint32(8);
  const hasIHDR = IHDR.every((byte, index) => bytes[12 + index] === byte);
  if (ihdrLength !== 13 || !hasIHDR) throw new PNGValidationError("incomplete");

  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const pixels = width * height;
  if (
    width === 0 ||
    height === 0 ||
    width > MAXIMUM_SOURCE_PNG_DIMENSION ||
    height > MAXIMUM_SOURCE_PNG_DIMENSION ||
    !Number.isSafeInteger(pixels) ||
    pixels > MAXIMUM_SOURCE_PNG_PIXELS
  ) {
    throw new PNGValidationError("dimensions");
  }
  return { width, height };
}
