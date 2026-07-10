// gifuct-js ships no type definitions and none exist on @types — minimal ambient
// declaration covering only what AnimatedStickerElement (EditorCanvas.tsx) uses.
declare module 'gifuct-js' {
  export interface GifFrame {
    dims: { top: number; left: number; width: number; height: number };
    delay: number;
    disposalType: number;
    patch: Uint8ClampedArray;
  }

  export interface ParsedGif {
    lsd: { width: number; height: number };
  }

  export function parseGIF(buffer: ArrayBuffer): ParsedGif;
  export function decompressFrames(gif: ParsedGif, buildImagePatches: boolean): GifFrame[];
}
