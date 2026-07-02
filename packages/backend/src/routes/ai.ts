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

// Never forward an upstream provider's 401/403 as-is — the frontend treats any 401/403
// from our API as "your session expired" and force-logs the user out. An invalid AI
// provider key is a different failure and must not trigger that.
function upstreamStatus(status: number): number {
  return status === 401 || status === 403 ? 502 : status;
}

// Generate text content
router.post('/generate', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { provider, prompt, type } = req.body;
    console.log(`[ai/generate] request received userId=${req.userId} provider=${provider} type=${type || 'text'}`);

    if (!provider || !prompt) {
      return res.status(400).json({ error: 'Provider and prompt are required' });
    }

    if (type === 'image' && provider !== 'openai') {
      return res.status(400).json({ error: `${provider} does not support image generation. Add an OpenAI API key in Settings to generate images.` });
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
      console.error(`[ai/generate] no API key found for provider=${provider} userId=${req.userId}`);
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

    if (provider === 'openai' && type === 'image') {
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt,
          n: 1,
          size: '1024x1024',
        }),
      });

      if (!response.ok) {
        const err = await response.json() as any;
        console.error(`[ai/generate] openai image request failed status=${response.status}`, err);
        await prisma.aIRequest.update({ where: { id: aiRequest.id }, data: { status: 'failed', error: err.error?.message || 'Image generation failed' } });
        return res.status(upstreamStatus(response.status)).json({ error: err.error?.message || 'Image generation failed' });
      }

      const data = await response.json() as any;
      const imageUrl = data.data?.[0]?.url || '';
      console.log(`[ai/generate] openai image generated userId=${req.userId}`);

      await prisma.aIRequest.update({ where: { id: aiRequest.id }, data: { status: 'completed' } });
      const generation = await prisma.aIGeneration.create({
        data: { userId: req.userId!, provider, prompt, result: imageUrl, contentType: 'image' },
      });
      await prisma.recentActivity.create({
        data: { userId: req.userId!, activityType: 'ai_generation', referenceId: generation.id },
      }).catch((e) => console.error('[ai/generate] failed to log recent activity', e));

      return res.json({ content: imageUrl, contentType: 'image' });
    } else if (provider === 'openai') {
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
        console.error(`[ai/generate] openai request failed status=${response.status}`, err);
        await prisma.aIRequest.update({ where: { id: aiRequest.id }, data: { status: 'failed', error: err.error?.message || 'AI request failed' } });
        return res.status(upstreamStatus(response.status)).json({ error: err.error?.message || 'AI request failed' });
      }

      const data = await response.json() as any;
      const content = data.choices?.[0]?.message?.content || 'No content generated';
      const tokens = Number(data.usage?.total_tokens || 0);
      console.log(`[ai/generate] openai text generated userId=${req.userId} tokens=${tokens}`);

      await prisma.aIRequest.update({ where: { id: aiRequest.id }, data: { status: 'completed', tokensUsed: tokens } });
      const generation = await prisma.aIGeneration.create({
        data: { userId: req.userId!, provider, prompt, result: content, contentType: type || 'text', tokensUsed: tokens },
      });
      await prisma.recentActivity.create({
        data: { userId: req.userId!, activityType: 'ai_generation', referenceId: generation.id },
      }).catch((e) => console.error('[ai/generate] failed to log recent activity', e));

      res.json({ content, contentType: type || 'text', usage: data.usage });
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
        console.error(`[ai/generate] anthropic request failed status=${response.status}`, err);
        await prisma.aIRequest.update({ where: { id: aiRequest.id }, data: { status: 'failed', error: err.error?.message || 'AI request failed' } });
        return res.status(upstreamStatus(response.status)).json({ error: err.error?.message || 'AI request failed' });
      }

      const data = await response.json() as any;
      const content = data.content?.[0]?.text || 'No content generated';
      const tokens = Number(data.usage?.input_tokens || 0) + Number(data.usage?.output_tokens || 0);
      console.log(`[ai/generate] anthropic text generated userId=${req.userId} tokens=${tokens}`);

      await prisma.aIRequest.update({ where: { id: aiRequest.id }, data: { status: 'completed', tokensUsed: tokens } });
      const generation = await prisma.aIGeneration.create({
        data: { userId: req.userId!, provider, prompt, result: content, contentType: type || 'text', tokensUsed: tokens },
      });
      await prisma.recentActivity.create({
        data: { userId: req.userId!, activityType: 'ai_generation', referenceId: generation.id },
      }).catch((e) => console.error('[ai/generate] failed to log recent activity', e));

      res.json({ content, contentType: type || 'text', usage: data.usage });
    } else {
      res.status(400).json({ error: 'Unsupported provider' });
    }
  } catch (err: any) {
    console.error('[ai/generate] unhandled error', err);
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
