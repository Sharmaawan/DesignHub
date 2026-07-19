import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { decryptSecret as decryptKey } from '../lib/crypto';
import { remapUpstreamStatus as upstreamStatus } from '../lib/http';

const router = Router();

// gpt-image-1 can legitimately take 30-90s; text completions are normally much
// faster but can still stall on a bad connection. This bounds every upstream
// call so a hung provider request can never hold a connection (and its DB row)
// open indefinitely — fetch() has no timeout of its own.
const UPSTREAM_TIMEOUT_MS = 120_000;

// Decodes a `data:<mime>;base64,<data>` URL into a Buffer + mime type.
function decodeDataUrl(dataUrl: string): { buffer: Buffer; mime: string } {
  const match = /^data:(.+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error('Invalid reference image data');
  return { buffer: Buffer.from(match[2], 'base64'), mime: match[1] };
}

// Generate text or image content
router.post('/generate', authMiddleware, async (req: AuthRequest, res: Response) => {
  // The client (axios) has its own ~30s timeout and disconnects on it, but the
  // upstream OpenAI/Anthropic call keeps running server-side unless told to
  // stop. Left alone, a slow generation that finishes *after* the client gave
  // up would still try to write a response to a closed socket — throwing
  // uncaught, which crashes the whole Node process and takes every other
  // in-flight request down with it (this is what was causing the "blank page,
  // stuck until refresh" symptom: the backend died mid-request). One
  // AbortController tied to both the request's 'close' event and a hard
  // ceiling covers both "client left" and "provider never responds".
  const controller = new AbortController();
  const onClose = () => controller.abort();
  req.on('close', onClose);
  const upstreamTimer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  // Every response goes through this so a late/duplicate send (e.g. the abort
  // firing after we'd already started writing a success response) is a
  // harmless no-op instead of an ERR_HTTP_HEADERS_SENT throw.
  const send = (status: number, body: unknown) => {
    if (res.headersSent || res.writableEnded) return;
    res.status(status).json(body);
  };

  let aiRequestId: string | null = null;

  try {
    const { provider, prompt, type, referenceImages } = req.body;
    console.log(`[ai/generate] request received userId=${req.userId} provider=${provider} type=${type || 'text'}`);

    if (!provider || !prompt) {
      return send(400, { error: 'Provider and prompt are required' });
    }

    if (type === 'image' && provider !== 'openai') {
      return send(400, { error: `${provider} does not support image generation. Add an OpenAI API key in Settings to generate images.` });
    }

    let apiKey = '';
    let model = '';

    const setting = await prisma.aISetting.findFirst({
      where: { userId: req.userId, provider, isActive: true },
    });

    if (setting) {
      apiKey = decryptKey(setting.encryptedKey);
      model = setting.model || '';
    } else if (provider === 'anthropic') {
      apiKey = process.env.ANTHROPIC_API_KEY || '';
      model = model || 'claude-sonnet-4-6';
    } else if (provider === 'openai') {
      apiKey = process.env.OPENAI_API_KEY || '';
      model = model || 'gpt-3.5-turbo';
    }

    if (!apiKey) {
      console.error(`[ai/generate] no API key found for provider=${provider} userId=${req.userId}`);
      return send(404, { error: `No API key found for ${provider}. Add one in Settings or .env file.` });
    }

    const aiRequest = await prisma.aIRequest.create({
      data: {
        userId: req.userId!,
        provider,
        prompt,
        contentType: type || 'text',
        status: 'processing',
      },
    });
    aiRequestId = aiRequest.id;

    if (provider === 'openai' && type === 'image') {
      // With reference images (logo/template uploads) attached, use the edits endpoint
      // so the model incorporates their content instead of ignoring it.
      const refImages: string[] = Array.isArray(referenceImages)
        ? referenceImages.filter((r) => typeof r === 'string' && r.startsWith('data:'))
        : [];
      const useReference = refImages.length > 0;

      console.log(`[ai/generate] calling openai images.${useReference ? 'edits' : 'generations'} userId=${req.userId} promptLen=${prompt.length}`);
      const response = useReference
        ? await (async () => {
            const form = new FormData();
            form.append('model', 'gpt-image-1');
            form.append('prompt', prompt);
            form.append('n', '1');
            form.append('size', '1024x1024');
            refImages.forEach((ref, i) => {
              const { buffer, mime } = decodeDataUrl(ref);
              form.append('image[]', new Blob([new Uint8Array(buffer)], { type: mime }), `reference-${i}.png`);
            });
            return fetch('https://api.openai.com/v1/images/edits', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${apiKey}` },
              body: form,
              signal: controller.signal,
            });
          })()
        : await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: 'gpt-image-1',
              prompt,
              n: 1,
              size: '1024x1024',
            }),
            signal: controller.signal,
          });

      if (!response.ok) {
        const err = await response.json().catch(() => ({} as any)) as any;
        console.error(`[ai/generate] openai image request failed status=${response.status}`, err);
        await prisma.aIRequest.update({ where: { id: aiRequest.id }, data: { status: 'failed', error: err.error?.message || 'Image generation failed' } })
          .catch((e) => console.error('[ai/generate] failed to update request status', e));
        return send(upstreamStatus(response.status), { error: err.error?.message || 'Image generation failed' });
      }

      const data = await response.json() as any;
      let imageUrl = data.data?.[0]?.url || '';
      const b64 = data.data?.[0]?.b64_json;
      if (!imageUrl && b64) {
        // gpt-image-1 (edits) only returns base64 — persist it to disk so we
        // return a stable URL instead of storing a huge base64 blob in the DB.
        const filename = `${uuidv4()}.png`;
        fs.writeFileSync(path.join('uploads', filename), Buffer.from(b64, 'base64'));
        imageUrl = `/uploads/${filename}`;
      }
      console.log(`[ai/generate] openai image generated userId=${req.userId} withReference=${useReference}`);

      await prisma.aIRequest.update({ where: { id: aiRequest.id }, data: { status: 'completed' } });
      const generation = await prisma.aIGeneration.create({
        data: { userId: req.userId!, provider, prompt, result: imageUrl, contentType: 'image' },
      });
      await prisma.recentActivity.create({
        data: { userId: req.userId!, activityType: 'ai_generation', referenceId: generation.id },
      }).catch((e) => console.error('[ai/generate] failed to log recent activity', e));

      return send(200, { content: imageUrl, contentType: 'image' });
    }

    if (provider === 'openai') {
      console.log(`[ai/generate] calling openai chat.completions userId=${req.userId} model=${model || 'gpt-3.5-turbo'}`);
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
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({} as any)) as any;
        console.error(`[ai/generate] openai request failed status=${response.status}`, err);
        await prisma.aIRequest.update({ where: { id: aiRequest.id }, data: { status: 'failed', error: err.error?.message || 'AI request failed' } })
          .catch((e) => console.error('[ai/generate] failed to update request status', e));
        return send(upstreamStatus(response.status), { error: err.error?.message || 'AI request failed' });
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

      return send(200, { content, contentType: type || 'text', usage: data.usage });
    }

    if (provider === 'anthropic') {
      console.log(`[ai/generate] calling anthropic messages userId=${req.userId} model=${model || 'claude-sonnet-4-6'}`);
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
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({} as any)) as any;
        console.error(`[ai/generate] anthropic request failed status=${response.status}`, err);
        await prisma.aIRequest.update({ where: { id: aiRequest.id }, data: { status: 'failed', error: err.error?.message || 'AI request failed' } })
          .catch((e) => console.error('[ai/generate] failed to update request status', e));
        return send(upstreamStatus(response.status), { error: err.error?.message || 'AI request failed' });
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

      return send(200, { content, contentType: type || 'text', usage: data.usage });
    }

    return send(400, { error: 'Unsupported provider' });
  } catch (err: any) {
    const aborted = err?.name === 'AbortError';
    const clientGone = req.destroyed;
    console.error(
      `[ai/generate] ${aborted ? (clientGone ? 'client disconnected mid-request' : 'upstream timed out') : 'unhandled error'} userId=${req.userId}`,
      aborted ? '' : err,
    );
    if (aiRequestId) {
      await prisma.aIRequest.update({
        where: { id: aiRequestId },
        data: { status: 'failed', error: aborted ? 'Timed out waiting for the AI provider' : (err.message || 'AI generation failed') },
      }).catch((e) => console.error('[ai/generate] failed to update request status', e));
    }
    send(aborted ? 504 : 500, { error: aborted ? 'The AI provider took too long to respond. Please try again.' : (err.message || 'AI generation failed') });
  } finally {
    clearTimeout(upstreamTimer);
    req.off('close', onClose);
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
