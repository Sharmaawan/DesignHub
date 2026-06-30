import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import crypto from 'crypto';

const router = Router();

const ENCRYPTION_KEY = process.env.API_KEY_SECRET || 'designhub-api-key-secret-2024!';

function decryptKey(encrypted: string): string {
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.alloc(32, ENCRYPTION_KEY.slice(0, 32)), Buffer.alloc(16));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Generate text content
router.post('/generate', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { provider, prompt, type } = req.body;
    if (!provider || !prompt) {
      return res.status(400).json({ error: 'Provider and prompt are required' });
    }

    let apiKey = '';
    let model = '';

    const setting = await prisma.aISetting.findFirst({
      where: { userId: req.userId, provider, isActive: true },
    });

    if (setting) {
      apiKey = decryptKey(setting.encryptedKey);
      model = setting.model || '';
    } else {
      if (provider === 'anthropic') {
        apiKey = process.env.ANTHROPIC_API_KEY || '';
        model = model || 'claude-sonnet-4-6';
      } else if (provider === 'openai') {
        apiKey = process.env.OPENAI_API_KEY || '';
        model = model || 'gpt-3.5-turbo';
      }
    }

    if (!apiKey) {
      return res.status(404).json({ error: `No API key found for ${provider}. Add one in Settings or .env file.` });
    }

    // Log the request
    const aiRequest = await prisma.aIRequest.create({
      data: {
        userId: req.userId!,
        provider,
        prompt,
        contentType: type || 'text',
        status: 'processing',
      },
    });

    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1000,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const err = await response.json() as any;
        await prisma.aIRequest.update({ where: { id: aiRequest.id }, data: { status: 'failed', error: err.error?.message || 'AI request failed' } });
        return res.status(response.status).json({ error: err.error?.message || 'AI request failed' });
      }

      const data = await response.json() as any;
      const content = data.choices?.[0]?.message?.content || 'No content generated';
      const tokens = Number(data.usage?.total_tokens || 0);

      await prisma.aIRequest.update({ where: { id: aiRequest.id }, data: { status: 'completed', tokensUsed: tokens } });
      await prisma.aIGeneration.create({
        data: { userId: req.userId!, provider, prompt, result: content, contentType: type || 'text', tokensUsed: tokens },
      });

      res.json({ content, usage: data.usage });
    } else if (provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: model || 'claude-sonnet-4-6',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        const err = await response.json() as any;
        await prisma.aIRequest.update({ where: { id: aiRequest.id }, data: { status: 'failed', error: err.error?.message || 'AI request failed' } });
        return res.status(response.status).json({ error: err.error?.message || 'AI request failed' });
      }

      const data = await response.json() as any;
      const content = data.content?.[0]?.text || 'No content generated';
      const tokens = Number(data.usage?.input_tokens || 0) + Number(data.usage?.output_tokens || 0);

      await prisma.aIRequest.update({ where: { id: aiRequest.id }, data: { status: 'completed', tokensUsed: tokens } });
      await prisma.aIGeneration.create({
        data: { userId: req.userId!, provider, prompt, result: content, contentType: type || 'text', tokensUsed: tokens },
      });

      res.json({ content, usage: data.usage });
    } else {
      res.status(400).json({ error: 'Unsupported provider' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'AI generation failed' });
  }
});

// Get user's generation history
router.get('/history', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const generations = await prisma.aIGeneration.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json(generations);
  } catch {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Get user's request stats
router.get('/stats', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const totalRequests = await prisma.aIRequest.count({ where: { userId: req.userId } });
    const successfulRequests = await prisma.aIRequest.count({ where: { userId: req.userId, status: 'completed' } });
    const totalTokens = await prisma.aIRequest.aggregate({ where: { userId: req.userId }, _sum: { tokensUsed: true } });
    res.json({
      totalRequests,
      successfulRequests,
      totalTokens: totalTokens._sum.tokensUsed || 0,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;
