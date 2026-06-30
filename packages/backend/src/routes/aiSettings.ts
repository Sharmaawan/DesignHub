import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import crypto from 'crypto';

const router = Router();

// Simple XOR encryption for API keys (not production-grade, but prevents plain text storage)
const ENCRYPTION_KEY = process.env.API_KEY_SECRET || 'designhub-api-key-secret-2024!';

function encryptKey(text: string): string {
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.alloc(32, ENCRYPTION_KEY.slice(0, 32)), Buffer.alloc(16));
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

function decryptKey(encrypted: string): string {
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.alloc(32, ENCRYPTION_KEY.slice(0, 32)), Buffer.alloc(16));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Get all AI settings for user
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const settings = await prisma.aISetting.findMany({
      where: { userId: req.userId },
      orderBy: { updatedAt: 'desc' },
    });
    // Mask API keys in response - only show last 4 chars
    const masked = settings.map((s) => ({
      id: s.id,
      provider: s.provider,
      hasKey: !!s.encryptedKey,
      keyPreview: s.encryptedKey ? `...${decryptKey(s.encryptedKey).slice(-4)}` : null,
      model: s.model,
      isActive: s.isActive,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
    res.json(masked);
  } catch {
    res.status(500).json({ error: 'Failed to fetch AI settings' });
  }
});

// Save/update API key for a provider
router.post('/key', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { provider, apiKey, model } = req.body;
    if (!provider || !apiKey) return res.status(400).json({ error: 'Provider and API key are required' });

    const encrypted = encryptKey(apiKey);

    // Upsert: update if exists, create if not
    const existing = await prisma.aISetting.findFirst({
      where: { userId: req.userId, provider },
    });

    if (existing) {
      await prisma.aISetting.update({
        where: { id: existing.id },
        data: { encryptedKey: encrypted, model, isActive: true },
      });
    } else {
      await prisma.aISetting.create({
        data: {
          provider,
          encryptedKey: encrypted,
          model,
          isActive: true,
          userId: req.userId!,
        },
      });
    }

    res.json({ success: true, message: 'API key saved securely' });
  } catch {
    res.status(500).json({ error: 'Failed to save API key' });
  }
});

// Delete API key
router.delete('/key/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.aISetting.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

// Toggle active status
router.put('/key/:id/toggle', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const setting = await prisma.aISetting.findUnique({ where: { id: req.params.id } });
    if (!setting) return res.status(404).json({ error: 'Setting not found' });
    await prisma.aISetting.update({
      where: { id: req.params.id },
      data: { isActive: !setting.isActive },
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to toggle AI setting' });
  }
});

// Get decrypted API key (internal use only - for making AI calls)
router.get('/key/:provider', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const setting = await prisma.aISetting.findFirst({
      where: { userId: req.userId, provider: req.params.provider, isActive: true },
    });
    if (!setting) return res.status(404).json({ error: 'No active API key for this provider' });
    const decrypted = decryptKey(setting.encryptedKey);
    res.json({ provider: setting.provider, apiKey: decrypted, model: setting.model });
  } catch {
    res.status(500).json({ error: 'Failed to retrieve API key' });
  }
});

export default router;
