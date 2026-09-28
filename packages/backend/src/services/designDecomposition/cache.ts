import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// File-backed cache keyed by source-image hash + decomposition version, so the
// exact same image never triggers a second paid vision call or a second
// segmentation pass. Only SUCCESSFUL results are ever written — a failure
// (no credits, model access denied) must never be cached, or the feature
// would stay broken after the account is fixed.
export const CACHE_DIR = path.join(process.cwd(), 'uploads', 'decomposition-cache');

export const sha256 = (data: Buffer | string) => crypto.createHash('sha256').update(data).digest('hex');

export function cachePath(name: string): string {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  return path.join(CACHE_DIR, name);
}

export function readJsonCache<T>(name: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(cachePath(name), 'utf8')) as T;
  } catch {
    return null;
  }
}

export function writeJsonCache(name: string, value: unknown): void {
  fs.writeFileSync(cachePath(name), JSON.stringify(value));
}
