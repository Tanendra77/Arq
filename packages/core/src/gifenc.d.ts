// gifenc ships no types; this covers the part of its API the GIF export uses.
declare module "gifenc" {
  type Palette = number[][];
  type Format = "rgb565" | "rgb444" | "rgba4444";
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, options?: { format?: Format; oneBitAlpha?: boolean | number }): Palette;
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette, format?: Format): Uint8Array;
  export function GIFEncoder(options?: { auto?: boolean; initialCapacity?: number }): {
    writeFrame(index: Uint8Array, width: number, height: number, options?: {
      palette?: Palette; first?: boolean; transparent?: boolean; transparentIndex?: number; delay?: number; repeat?: number; dispose?: number;
    }): void;
    finish(): void;
    bytes(): Uint8Array;
  };
}
