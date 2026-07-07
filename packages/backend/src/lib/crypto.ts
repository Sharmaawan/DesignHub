import crypto from 'crypto';

// Shared by AI provider keys and social platform tokens — was previously duplicated
// verbatim in routes/ai.ts and routes/aiSettings.ts.
const ENCRYPTION_KEY = process.env.API_KEY_SECRET || 'designhub-api-key-secret-2024!';

export function encryptSecret(text: string): string {
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.alloc(32, ENCRYPTION_KEY.slice(0, 32)), Buffer.alloc(16));
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

export function decryptSecret(encrypted: string): string {
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.alloc(32, ENCRYPTION_KEY.slice(0, 32)), Buffer.alloc(16));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
