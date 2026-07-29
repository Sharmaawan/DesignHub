// Downsampled min/max peaks for rendering an audio clip's waveform in the timeline UI,
// computed client-side via the Web Audio API — no wavesurfer.js or similar dependency.
// Cached in memory by src since the same audio file's waveform never changes and
// re-decoding on every re-render/drag would be wasteful.

export interface WaveformPeaks {
  peaks: Float32Array; // interleaved [min, max] pairs, length = buckets * 2
  buckets: number;
}

const cache = new Map<string, Promise<WaveformPeaks>>();

export function getWaveform(src: string, buckets = 300): Promise<WaveformPeaks> {
  const key = `${src}::${buckets}`;
  let entry = cache.get(key);
  if (!entry) {
    entry = computeWaveform(src, buckets);
    cache.set(key, entry);
  }
  return entry;
}

async function computeWaveform(src: string, buckets: number): Promise<WaveformPeaks> {
  const res = await fetch(src);
  const arrayBuffer = await res.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const channel = audioBuffer.getChannelData(0);
    const samplesPerBucket = Math.max(1, Math.floor(channel.length / buckets));
    const peaks = new Float32Array(buckets * 2);
    for (let b = 0; b < buckets; b++) {
      let min = 0;
      let max = 0;
      const start = b * samplesPerBucket;
      const end = Math.min(channel.length, start + samplesPerBucket);
      for (let i = start; i < end; i++) {
        const v = channel[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      peaks[b * 2] = min;
      peaks[b * 2 + 1] = max;
    }
    return { peaks, buckets };
  } finally {
    ctx.close();
  }
}
