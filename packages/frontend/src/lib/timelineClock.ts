// Shared playback clock for video-timeline scenes. One requestAnimationFrame loop
// drives every clocked <video>/<audio> element instead of each one animating itself
// independently (which is how non-timeline video/GIF elements still behave — this
// clock only touches elements that opt in via registerMedia).
//
// Time lives in a plain instance field, not React state — ticking 60x/second through
// Zustand would thrash every subscribed component. UI consumers (the scrubber) should
// use `subscribeUi`, which is throttled; playback-critical consumers (media elements
// deciding whether to show/play) should use `subscribe`, which fires every frame but
// only calls back, never triggers a re-render on its own.

export interface ClipTiming {
  timelineStart: number; // ms
  timelineEnd: number; // ms
}

interface RegisteredMedia {
  el: HTMLVideoElement | HTMLAudioElement;
  getTiming: () => ClipTiming | null;
  mediaOffsetMs: number; // media.currentTime (ms) that lines up with timelineStart
}

const DRIFT_THRESHOLD_MS = 200;
const UI_UPDATE_INTERVAL_MS = 1000 / 12;

export class TimelineClock {
  private currentMs = 0;
  private durationMs = 0;
  private playing = false;
  private rate = 1;
  private rafId: number | null = null;
  private lastFrameTime = 0;
  private lastUiUpdate = 0;
  private media = new Map<string, RegisteredMedia>();
  private tickSubscribers = new Set<(ms: number) => void>();
  private uiSubscribers = new Set<(ms: number) => void>();
  private endSubscribers = new Set<() => void>();

  registerMedia(
    id: string,
    el: HTMLVideoElement | HTMLAudioElement,
    getTiming: () => ClipTiming | null,
    mediaOffsetMs = 0
  ) {
    this.media.set(id, { el, getTiming, mediaOffsetMs });
    // Immediately place the element at the current playhead so a clip added while
    // paused (or mid-playback) doesn't sit at frame 0 until the next seek.
    this.syncOne(id, true);
    return () => {
      this.media.delete(id);
    };
  }

  subscribe(cb: (ms: number) => void) {
    this.tickSubscribers.add(cb);
    return () => { this.tickSubscribers.delete(cb); };
  }

  subscribeUi(cb: (ms: number) => void) {
    this.uiSubscribers.add(cb);
    return () => { this.uiSubscribers.delete(cb); };
  }

  onEnd(cb: () => void) {
    this.endSubscribers.add(cb);
    return () => { this.endSubscribers.delete(cb); };
  }

  getCurrentMs() {
    return this.currentMs;
  }

  getIsPlaying() {
    return this.playing;
  }

  setDuration(ms: number) {
    this.durationMs = Math.max(0, ms);
  }

  setPlaybackRate(rate: number) {
    this.rate = rate;
  }

  play() {
    if (this.playing) return;
    if (this.durationMs > 0 && this.currentMs >= this.durationMs) this.currentMs = 0;
    this.playing = true;
    this.lastFrameTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  pause() {
    this.playing = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.media.forEach(({ el }) => el.pause());
  }

  seek(ms: number) {
    this.currentMs = this.durationMs > 0 ? Math.max(0, Math.min(ms, this.durationMs)) : Math.max(0, ms);
    this.syncAll(true);
    this.notify(true);
  }

  private loop = () => {
    if (!this.playing) return;
    const now = performance.now();
    const elapsed = (now - this.lastFrameTime) * this.rate;
    this.lastFrameTime = now;
    this.currentMs += elapsed;

    if (this.durationMs > 0 && this.currentMs >= this.durationMs) {
      this.currentMs = this.durationMs;
      // pause() (which flips `playing` to false) must run BEFORE notify() — a
      // subscriber reading getIsPlaying() from inside its notify callback needs to see
      // the final, settled state, not a stale "still playing" read from the instant
      // before pause() ran.
      this.pause();
      this.syncAll(true);
      this.notify(true);
      this.endSubscribers.forEach((cb) => cb());
      return;
    }

    this.syncAll(false);
    this.notify(false);
    this.rafId = requestAnimationFrame(this.loop);
  };

  private syncAll(forceSeek: boolean) {
    this.media.forEach((_entry, id) => this.syncOne(id, forceSeek));
  }

  private syncOne(id: string, forceSeek: boolean) {
    const entry = this.media.get(id);
    if (!entry) return;
    const { el, getTiming, mediaOffsetMs } = entry;
    const timing = getTiming();
    if (!timing) {
      if (!el.paused) el.pause();
      return;
    }
    const { timelineStart, timelineEnd } = timing;
    const active = this.currentMs >= timelineStart && this.currentMs < timelineEnd;
    if (!active) {
      if (!el.paused) el.pause();
      return;
    }
    const targetSec = Math.max(0, (mediaOffsetMs + (this.currentMs - timelineStart)) / 1000);
    if (forceSeek || Math.abs(el.currentTime - targetSec) * 1000 > DRIFT_THRESHOLD_MS) {
      el.currentTime = targetSec;
    }
    if (this.playing && el.paused) {
      el.play().catch(() => { /* browser blocked autoplay — sync still keeps frame position correct */ });
    } else if (!this.playing && !el.paused) {
      el.pause();
    }
  }

  private notify(forceUi: boolean) {
    this.tickSubscribers.forEach((cb) => cb(this.currentMs));
    const now = performance.now();
    if (forceUi || now - this.lastUiUpdate >= UI_UPDATE_INTERVAL_MS) {
      this.lastUiUpdate = now;
      this.uiSubscribers.forEach((cb) => cb(this.currentMs));
    }
  }
}

// The live editor canvas and the Preview overlay can be mounted at the same time
// (Preview renders its own EditorCanvas on top of the still-mounted editor canvas
// underneath) — each needs its own clock instance so scrubbing/playing one doesn't
// fight over a single shared playhead with the other. `timelineClock` is the default
// singleton the live editor canvas uses; anything needing an isolated playback
// context (Preview) should create its own via `createTimelineClock()`.
export function createTimelineClock() {
  return new TimelineClock();
}

export const timelineClock = new TimelineClock();
