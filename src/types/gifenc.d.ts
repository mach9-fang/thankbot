declare module "gifenc" {
  export function GIFEncoder(opts?: {
    auto?: boolean;
    initialCapacity?: number;
  }): {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      opts?: {
        palette?: number[][];
        delay?: number;
        repeat?: number;
        transparent?: boolean;
        transparentIndex?: number;
      }
    ): void;
    finish(): void;
    bytes(): Uint8Array;
  };

  export function quantize(
    data: Uint8Array | Uint8ClampedArray,
    maxColors: number
  ): number[][];

  export function applyPalette(
    data: Uint8Array | Uint8ClampedArray,
    palette: number[][],
    format?: string
  ): Uint8Array;
}
