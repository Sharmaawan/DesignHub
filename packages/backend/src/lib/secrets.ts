// Centralizes the "fall back to a dev default, but never in production" rule for
// secrets that used to have their hardcoded fallback duplicated (and publicly
// visible in the repo) across middleware/auth.ts, routes/auth.ts, and lib/crypto.ts.
export function requireSecret(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} must be set in production — refusing to start with the public dev fallback.`);
  }
  return devFallback;
}

export const JWT_SECRET = requireSecret('JWT_SECRET', 'designhub-secret-key-2024');
export const API_KEY_SECRET = requireSecret('API_KEY_SECRET', 'designhub-api-key-secret-2024!');
