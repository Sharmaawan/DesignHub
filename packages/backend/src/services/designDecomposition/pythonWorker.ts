import { spawn, ChildProcess } from 'child_process';
import path from 'path';

// Manages the local FastSAM worker (python-worker/server.py) as a child
// process of this Node server — spawned lazily on first use, kept alive for
// reuse (avoids paying its ~4-7s import+model-load cost on every request),
// and treated as a plain local dependency: no network call ever leaves the
// machine once the model checkpoint is on disk. If the process dies, the
// next call respawns it.
const WORKER_DIR = path.join(process.cwd(), 'python-worker');
const WORKER_SCRIPT = path.join(WORKER_DIR, 'server.py');
const PORT = Number(process.env.LOCAL_SEGMENTATION_PORT || 8765);
const BASE_URL = `http://127.0.0.1:${PORT}`;
// Explicit path, not the bare `python` command — on Windows, `python` can
// resolve to the Microsoft Store's App Execution Alias stub instead of a
// real interpreter depending on the calling process's PATH resolution,
// which differs between an interactive shell and a spawned child process.
// Confirmed directly on this machine: `where python` surfaces the Store
// alias ahead of the real C:\Python313\python.exe in some contexts.
const PYTHON_BIN = process.env.LOCAL_SEGMENTATION_PYTHON || 'C:\\Python313\\python.exe';
const READY_TIMEOUT_MS = 120_000; // first model load can take a while on a cold cache
const HEALTH_POLL_MS = 500;

let worker: ChildProcess | null = null;
let readyPromise: Promise<void> | null = null;

function startProcess(): ChildProcess {
  const child = spawn(PYTHON_BIN, [WORKER_SCRIPT], {
    cwd: WORKER_DIR,
    env: { ...process.env, WORKER_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (d) => console.log('[segmentation-worker]', d.toString().trim()));
  child.stderr?.on('data', (d) => console.log('[segmentation-worker]', d.toString().trim()));
  child.on('exit', (code) => {
    console.log(`[segmentation-worker] exited (code ${code})`);
    if (worker === child) { worker = null; readyPromise = null; }
  });
  child.on('error', (err) => {
    console.error('[segmentation-worker] failed to start', err);
    if (worker === child) { worker = null; readyPromise = null; }
  });
  return child;
}

async function pollHealth(deadline: number): Promise<void> {
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {
      // not up yet — keep polling
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_MS));
  }
  throw new Error('Local segmentation worker did not become healthy in time');
}

/** Ensures the worker process is running and responsive. Safe to call repeatedly — subsequent calls reuse the same process/readiness check. */
export async function ensureWorkerRunning(): Promise<void> {
  if (worker && readyPromise) return readyPromise;
  worker = startProcess();
  readyPromise = pollHealth(Date.now() + READY_TIMEOUT_MS).catch((err) => {
    worker?.kill();
    worker = null;
    readyPromise = null;
    throw err;
  });
  return readyPromise;
}

export interface RawWorkerMask {
  bbox: [number, number, number, number];
  score: number;
  maskPng: string; // base64 PNG, cropped to bbox
}

export interface WorkerSegmentResult {
  count: number;
  elapsedSeconds: number;
  imageWidth: number;
  imageHeight: number;
  masks: RawWorkerMask[];
}

export class LocalWorkerUnavailableError extends Error {}

/**
 * Runs FastSAM's automatic mask generation over the whole image, entirely
 * locally. Returns every raw candidate the model found — dozens to low
 * hundreds on a busy design — completely unfiltered; deciding which of
 * those are "meaningful" is the caller's job (LocalSegmentationProvider.ts),
 * not this transport layer's.
 */
export async function segmentImage(
  absolutePath: string,
  opts: { imgsz?: number; conf?: number; iou?: number; minAreaFrac?: number; maxAreaFrac?: number; minSolidity?: number } = {},
): Promise<WorkerSegmentResult> {
  try {
    await ensureWorkerRunning();
  } catch (err: any) {
    throw new LocalWorkerUnavailableError(`Local segmentation worker unavailable: ${err?.message || 'failed to start'}`);
  }
  const res = await fetch(`${BASE_URL}/segment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imagePath: absolutePath, ...opts }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    const body: any = await res.json().catch(() => ({}));
    throw new LocalWorkerUnavailableError(body?.error || `Segmentation worker returned ${res.status}`);
  }
  return res.json() as Promise<WorkerSegmentResult>;
}
