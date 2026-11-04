import 'dotenv/config'
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { mkdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import { createServer } from 'node:http'
import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express'
import cors from 'cors'
import multer from 'multer'
import { OAuth2Client } from 'google-auth-library'
import nodemailer from 'nodemailer'
import { cleanupExportJob, getExportJob, readExportOutput, startExportJob, type ExportInput } from './videoExport.js'
import { WebSocketServer, type WebSocket } from 'ws'
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { authenticateUser, emailDomains, issueToken, registerUser, requireAuth, type AuthUser } from './auth.js'
import { connectDatabase, db, one, rows, run, sqlValues } from './db.js'

const app = express()
const server = createServer(app)
const port = Number(process.env.PORT ?? 8787)
const storageDir = path.resolve(process.env.STORAGE_DIR ?? './data/uploads')
const publicUrl = (process.env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, '')
const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173'
const mlWorkerUrl = (process.env.ML_WORKER_URL ?? 'http://localhost:8090').replace(/\/$/, '')
const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((origin) => origin.trim())
const googleClientId = process.env.GOOGLE_CLIENT_ID ?? ''
const cryptoKey = createHash('sha256')
  .update(process.env.CRYPTO_MASTER_KEY ?? 'designhub-dev-only-crypto-master-key-change-me')
  .digest()

const aiProviders = {
  anthropic: { text: 'claude-sonnet-5-5', image: '', supportsImages: false },
  google: { text: 'gemini-2.5-flash', image: 'gemini-2.5-flash-image', supportsImages: true },
  openai: { text: 'gpt-4o-mini', image: 'gpt-image-1', supportsImages: true },
  openrouter: { text: 'openai/gpt-4o-mini', image: '', supportsImages: false },
} as const
type AiProvider = keyof typeof aiProviders

type AnyRow = RowDataPacket & Record<string, unknown>

interface FacebookPageAccount {
  externalId: string
  displayName: string
  token: string
  loginId?: string
  loginName?: string
}

interface SocialOAuthAccount {
  token: string
  externalId: string
  displayName: string
  expiresIn: number | null
  refreshToken: string | null
  pages?: FacebookPageAccount[]
  loginId?: string
  loginName?: string
}

app.disable('x-powered-by')
app.use(cors({ origin: corsOrigins, exposedHeaders: ['Content-Disposition'] }))
app.use(express.json({ limit: '100mb' }))
app.use(express.urlencoded({ extended: true, limit: '100mb' }))
app.use('/uploads', express.static(storageDir))

function userOf(req: Request): AuthUser {
  if (!req.user) throw Object.assign(new Error('Sign in again to continue.'), { status: 401 })
  return req.user
}

function idOf(value: string | string[] | undefined) {
  const id = Number(Array.isArray(value) ? value[0] : value)
  if (!Number.isSafeInteger(id) || id <= 0) throw Object.assign(new Error('Invalid id.'), { status: 400 })
  return id
}

function objectBody(req: Request) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    throw Object.assign(new Error('A JSON object is required.'), { status: 400 })
  }
  return req.body as Record<string, unknown>
}

function insertId(result: unknown) {
  return Number((result as ResultSetHeader).insertId)
}

function jsonValue(value: unknown, fallback: unknown = {}) {
  if (typeof value !== 'string') return value ?? fallback
  try {
    return JSON.parse(value) as unknown
  } catch {
    return fallback
  }
}

  function encryptSecret(value: string) {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', cryptoKey, iv)
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.')
  }

  function decryptSecret(value: string) {
    const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64url'))
    if (!iv || !tag || !encrypted) throw new Error('Stored provider credential is malformed.')
    const decipher = createDecipheriv('aes-256-gcm', cryptoKey, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
  }

  function htmlEscape(value: string) {
    return value.replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[char]!)
  }

  function mailConfiguration() {
    const host = process.env.SMTP_HOST ?? ''
    const port = Number(process.env.SMTP_PORT ?? 587)
    const user = process.env.SMTP_USER ?? ''
    const pass = process.env.SMTP_PASS ?? ''
    const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465
    return { host, port, user, pass, secure, from: process.env.MAIL_FROM ?? `DesignHub <${user}>` }
  }

  let mailTransport: ReturnType<typeof nodemailer.createTransport> | null = null
  let mailTransportKey = ''
  function smtpTransport(config: ReturnType<typeof mailConfiguration>) {
    const key = `${config.host}:${config.port}:${config.user}`
    if (mailTransport && mailTransportKey === key) return mailTransport
    mailTransport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
    })
    mailTransportKey = key
    return mailTransport
  }

  async function sendTransactionalEmail(to: string, name: string, subject: string, text: string, html: string) {
    const config = mailConfiguration()
    if (!config.host || !config.user || !config.pass) return { email: to, name, sent: false, problem: 'Email is not set up on the server yet' }
    try {
      await smtpTransport(config).sendMail({
        from: config.from,
        to: name ? `${name} <${to}>` : to,
        subject,
        text,
        html,
      })
      return { email: to, name, sent: true }
    } catch (error) {
      const code = (error as { responseCode?: number; code?: string }).responseCode ?? (error as { code?: string }).code
      const problem = code === 535 || code === 'EAUTH'
        ? 'The mail server rejected the username or password'
        : code === 'ECONNECTION' || code === 'ETIMEDOUT'
          ? 'The mail server could not be reached'
          : `The mail server returned an error (${code ?? (error as Error).message})`
      return { email: to, name, sent: false, problem }
    }
  }

  async function approvalEmailsEnabled(userId: number) {
    const settings = await one<AnyRow>('SELECT approvals FROM email_settings WHERE user_id = ?', [userId])
    return settings == null || Boolean(settings.approvals)
  }

  function isPrivateAddress(address: string) {
    if (address === '::1' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:')) return true
    if (isIP(address) === 4) {
      const [a, b] = address.split('.').map(Number)
      return a === 10 || a === 127 || (a === 172 && b! >= 16 && b! <= 31) ||
        (a === 192 && b === 168) || (a === 169 && b === 254) || a === 0
    }
    return false
  }

  async function validateAiBaseUrl(baseUrl: string | null) {
    if (!baseUrl) return
    let parsed: URL
    try {
      parsed = new URL(baseUrl)
    } catch {
      throw Object.assign(new Error('That base URL could not be understood.'), { status: 400 })
    }
    if (parsed.protocol !== 'https:' && process.env.ALLOW_PRIVATE_AI_URLS !== 'true') {
      throw Object.assign(new Error('The base URL must start with https://'), { status: 400 })
    }
    if (process.env.ALLOW_PRIVATE_AI_URLS === 'true') return
    const addresses = isIP(parsed.hostname)
      ? [{ address: parsed.hostname }]
      : await lookup(parsed.hostname, { all: true }).catch(() => [])
    if (!addresses.length) throw Object.assign(new Error('That base URL could not be reached.'), { status: 400 })
    if (addresses.some(({ address }) => isPrivateAddress(address))) {
      throw Object.assign(new Error('That address points inside a private network, which is not allowed.'), { status: 400 })
    }
  }

  async function postProviderJson(url: string, headers: Record<string, string>, body: unknown) {
    let response: globalThis.Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45_000),
      })
    } catch {
      throw Object.assign(new Error('The AI provider could not be reached from the server.'), { status: 502 })
    }
    const text = await response.text()
    let data: Record<string, unknown>
    try {
      data = JSON.parse(text) as Record<string, unknown>
    } catch {
      throw Object.assign(new Error('The AI provider returned an unreadable response.'), { status: 502 })
    }
    if (!response.ok) {
      const nested = data.error as Record<string, unknown> | undefined
      const providerMessage = String(nested?.message ?? '')
      const message = response.status === 401 || response.status === 403
        ? 'The AI provider rejected your API key.'
        : response.status === 429
          ? 'The AI provider is rate limiting this key. Try again shortly.'
          : providerMessage.slice(0, 250) || `The AI provider returned an error (${response.status}).`
      throw Object.assign(new Error(message), { status: response.status === 429 ? 429 : 502 })
    }
    return data
  }

  async function postHuggingFaceImage(url: string, key: string, body: unknown) {
    let response: globalThis.Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      })
    } catch {
      throw Object.assign(new Error('Hugging Face could not be reached from the server.'), { status: 502 })
    }

    const bytes = Buffer.from(await response.arrayBuffer())
    const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? ''
    if (!response.ok || !contentType.startsWith('image/')) {
      let providerMessage = ''
      try {
        const data = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>
        const error = data.error
        providerMessage = typeof error === 'string'
          ? error
          : String((error as Record<string, unknown> | undefined)?.message ?? '')
      } catch {
        providerMessage = ''
      }
      const message = response.status === 401 || response.status === 403
        ? 'Hugging Face rejected the token or the token does not have access to this model and inference provider.'
        : response.status === 429
          ? 'Hugging Face is rate limiting this request. Try again shortly.'
          : response.status === 503
            ? 'The Hugging Face model is loading or temporarily unavailable. Try again shortly.'
            : providerMessage.slice(0, 250) || 'Hugging Face did not return an image. Check the model ID and inference-provider access.'
      throw Object.assign(new Error(message), { status: response.status === 429 || response.status === 503 ? response.status : 502 })
    }
    if (!bytes.length) throw Object.assign(new Error('Hugging Face returned an empty image.'), { status: 502 })
    return { bytes, mime: contentType }
  }

  async function aiText(provider: AiProvider, key: string, model: string, base: string | null, system: string, prompt: string) {
    if (provider === 'google') {
      const data = await postProviderJson(
        `${(base ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '')}/models/${encodeURIComponent(model)}:generateContent`,
        { 'x-goog-api-key': key },
        { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }] },
      )
      const candidates = data.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined
      return candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''
    }
    if (provider === 'anthropic') {
      const data = await postProviderJson(
        `${(base ?? 'https://api.anthropic.com/v1').replace(/\/+$/, '')}/messages`,
        { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        { model, max_tokens: 4096, system, messages: [{ role: 'user', content: prompt }] },
      )
      const content = data.content as { text?: string }[] | undefined
      return content?.map((block) => block.text ?? '').join('') ?? ''
    }
    const data = await postProviderJson(
      `${(base ?? (provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1')).replace(/\/+$/, '')}/chat/completions`,
      {
        authorization: `Bearer ${key}`,
        ...(provider === 'openrouter' ? { 'HTTP-Referer': 'https://designhub.local', 'X-Title': 'DesignHub' } : {}),
      },
      { model, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] },
    )
    const choices = data.choices as { message?: { content?: string } }[] | undefined
    const answer = choices?.[0]?.message?.content
    if (typeof answer !== 'string' || !answer.trim()) throw Object.assign(new Error('The AI provider returned an empty reply.'), { status: 502 })
    return answer.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  }

  async function activeAiSettings(userId: number, needsImage = false) {
    const environmentTextKey = process.env.AI_TEXT_API_KEY?.trim()
    if (environmentTextKey) {
      const provider = (process.env.AI_TEXT_PROVIDER?.trim() || 'openai') as AiProvider
      const info = aiProviders[provider]
      if (!info) throw Object.assign(new Error('AI_TEXT_PROVIDER is not a supported provider.'), { status: 500 })
      if (needsImage && !info.supportsImages) {
        throw Object.assign(new Error(`${provider} cannot generate images.`), { status: 400 })
      }
      const baseUrl = process.env.AI_TEXT_BASE_URL?.trim() || null
      await validateAiBaseUrl(baseUrl)
      return {
        provider,
        key: environmentTextKey,
        textModel: process.env.AI_TEXT_MODEL?.trim() || info.text,
        imageModel: process.env.AI_TEXT_IMAGE_MODEL?.trim() || info.image,
        baseUrl,
      }
    }
    const setting = await one<AnyRow>(
      'SELECT provider, encrypted_key AS encryptedKey, text_model AS textModel, image_model AS imageModel, base_url AS baseUrl FROM ai_settings WHERE user_id = ? AND active = TRUE',
      [userId],
    )
    if (!setting) throw Object.assign(new Error('Connect an AI provider in AI settings to use this feature.'), { status: 400 })
    const provider = String(setting.provider) as AiProvider
    const info = aiProviders[provider]
    if (!info) throw Object.assign(new Error('The configured AI provider is not supported.'), { status: 400 })
    if (needsImage && !info.supportsImages) {
      throw Object.assign(new Error(`${provider} cannot generate images. Activate OpenAI or Google in AI settings.`), { status: 400 })
    }
    await validateAiBaseUrl(setting.baseUrl == null ? null : String(setting.baseUrl))
    return {
      provider,
      key: decryptSecret(String(setting.encryptedKey)),
      textModel: String(setting.textModel ?? info.text),
      imageModel: String(setting.imageModel ?? info.image),
      baseUrl: setting.baseUrl == null ? null : String(setting.baseUrl),
    }
  }

  async function trackAi<T>(userId: number, provider: string, kind: string, model: string, prompt: string, operation: () => Promise<T>, outputLength: (value: T) => number) {
    const start = Date.now()
    let success = false
    let size = 0
    try {
      const value = await operation()
      success = true
      size = outputLength(value)
      return value
    } finally {
      await run(
        'INSERT INTO ai_usage (user_id, provider, kind, model, prompt_chars, output_chars, success, latency_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, provider, kind, model, prompt.length, size, success, Date.now() - start],
      )
    }
  }
function publicUser(row: AnyRow) {
  return {
    id: Number(row.id),
    email: String(row.email),
    name: String(row.name),
    ...(row.avatarUrl ? { avatarUrl: String(row.avatarUrl) } : {}),
    role: String(row.role ?? 'USER'),
  }
}

async function accessRole(projectId: number, userId: number) {
  const access = await one<AnyRow>(
    `SELECT p.owner_id AS ownerId, p.team_id AS teamId, t.owner_id AS teamOwnerId,
       p.deleted_at AS deletedAt, c.role AS collaboratorRole, tm.role AS teamRole
     FROM projects p LEFT JOIN teams t ON t.id = p.team_id
     LEFT JOIN team_members tm ON tm.team_id = p.team_id AND tm.user_id = ?
     LEFT JOIN collaborators c ON c.project_id = p.id AND c.user_id = ?
     WHERE p.id = ?`,
    [userId, userId, projectId],
  )
  if (!access) throw Object.assign(new Error('Project not found.'), { status: 404 })
  if (Number(access.ownerId) === userId) return 'OWNER'
  if (access.deletedAt) throw Object.assign(new Error('Project not found.'), { status: 404 })
  const teamRole = Number(access.teamOwnerId) === userId ? 'EDITOR' : String(access.teamRole ?? '')
  const collaboratorRole = String(access.collaboratorRole ?? '')
  const rank = (role: string) => ({ VIEWER: 0, COMMENTER: 1, MAKER: 2, EDITOR: 3, OWNER: 4 }[role as 'VIEWER' | 'COMMENTER' | 'MAKER' | 'EDITOR' | 'OWNER'] ?? -1)
  if (rank(teamRole) >= 0 && rank(teamRole) >= rank(collaboratorRole)) return teamRole
  if (rank(collaboratorRole) >= 0) return collaboratorRole
  if (await isApprovalAdmin(userId)) return 'VIEWER'
  throw Object.assign(new Error('You do not have access to this project.'), { status: 403 })
}

const editRoles = new Set(['OWNER', 'MAKER', 'EDITOR'])

async function teamWorkflowRole(projectId: number, userId: number) {
  const membership = await one<AnyRow>(
    `SELECT t.owner_id AS ownerId, tm.role
     FROM projects p LEFT JOIN teams t ON t.id = p.team_id
     LEFT JOIN team_members tm ON tm.team_id = p.team_id AND tm.user_id = ?
     WHERE p.id = ?`,
    [userId, projectId],
  )
  if (!membership) throw Object.assign(new Error('Project not found.'), { status: 404 })
  if (membership.ownerId == null) return null
  if (Number(membership.ownerId) === userId) return 'ADMIN'
  return membership.role == null ? null : String(membership.role)
}

async function isApprovalAdmin(userId: number) {
  return Boolean(await one<AnyRow>(
    `SELECT id FROM users WHERE id = ? AND role = 'ADMIN'
     UNION SELECT id FROM teams WHERE owner_id = ? LIMIT 1`,
    [userId, userId],
  ))
}

async function userHasMakerRole(userId: number) {
  return Boolean(await one<AnyRow>(
    'SELECT id FROM team_members WHERE user_id = ? AND role = ? LIMIT 1',
    [userId, 'MAKER'],
  ))
}

async function requireProjectAccess(projectId: number, userId: number, edit = false) {
  const role = await accessRole(projectId, userId)
  if (edit && !editRoles.has(role)) throw Object.assign(new Error('You do not have permission to edit this project.'), { status: 403 })
  if (edit && await teamWorkflowRole(projectId, userId) === 'MAKER') {
    const pending = await one<AnyRow>(
      'SELECT id FROM design_approvals WHERE project_id = ? AND status = ? LIMIT 1',
      [projectId, 'PENDING'],
    )
    if (pending) throw Object.assign(new Error('This design is waiting for Editor approval. You can edit it after changes are requested.'), { status: 403 })
  }
  return role
}

async function projectSummary(projectId: number, userId: number) {
  const row = await one<AnyRow>(
    `SELECT p.id, p.title, p.width, p.height, p.thumbnail, p.updated_at AS updatedAt,
       p.created_at AS createdAt, p.deleted_at AS deletedAt, p.owner_id AS ownerId,
       p.team_id AS teamId, p.folder_id AS folderId, u.name AS ownerName,
       (f.id IS NOT NULL) AS favorite
     FROM projects p JOIN users u ON u.id = p.owner_id
     LEFT JOIN favorites f ON f.project_id = p.id AND f.user_id = ?
     WHERE p.id = ?`,
    [userId, projectId],
  )
  if (!row) throw Object.assign(new Error('Project not found.'), { status: 404 })
  const role = await accessRole(projectId, userId)
  return {
    id: Number(row.id),
    title: String(row.title),
    width: Number(row.width),
    height: Number(row.height),
    ...(row.thumbnail ? { thumbnail: String(row.thumbnail) } : {}),
    updatedAt: new Date(String(row.updatedAt)).toISOString(),
    createdAt: new Date(String(row.createdAt)).toISOString(),
    ...(row.deletedAt ? { deletedAt: new Date(String(row.deletedAt)).toISOString() } : {}),
    favorite: Boolean(row.favorite),
    access: role,
    ownerId: Number(row.ownerId),
    ownerName: String(row.ownerName),
    ...(row.folderId === null ? {} : { folderId: Number(row.folderId) }),
    ...(row.teamId === null ? {} : { teamId: Number(row.teamId) }),
  }
}

function publicAsset(row: Record<string, unknown>) {
  const mimeType = String(row.mimeType ?? 'application/octet-stream')
  const storedKind = String(row.kind ?? 'upload')
  const kind = storedKind === 'upload'
    ? mimeType.startsWith('image/')
      ? 'image'
      : mimeType.startsWith('video/')
        ? 'video'
        : mimeType.startsWith('audio/')
          ? 'audio'
          : storedKind
    : storedKind
  return {
    id: Number(row.id),
    kind,
    fileName: String(row.fileName),
    url: `${publicUrl}/api/files/${encodeURIComponent(String(row.storedName))}`,
    mimeType,
    sizeBytes: Number(row.sizeBytes),
    ...(row.width == null ? {} : { width: Number(row.width) }),
    ...(row.height == null ? {} : { height: Number(row.height) }),
    createdAt: new Date(String(row.createdAt)).toISOString(),
  }
}

app.get('/api/auth/config', (_req, res) => {
  res.json({ googleClientId, allowedEmailDomains: emailDomains() })
})

app.post('/api/auth/register', async (req, res) => {
  const body = objectBody(req)
  const user = await registerUser(String(body.name ?? ''), String(body.email ?? ''), String(body.password ?? ''))
  if (!user) throw new Error('Could not create user record.')
  res.status(201).json({ token: issueToken(publicUser(user)), user: publicUser(user) })
})

app.post('/api/auth/login', async (req, res) => {
  const body = objectBody(req)
  const user = await authenticateUser(String(body.email ?? ''), String(body.password ?? ''))
  res.json({ token: issueToken(user), user: publicUser(user) })
})

app.post('/api/auth/google', async (req, res) => {
  if (!googleClientId) throw Object.assign(new Error('Google sign-in is not configured.'), { status: 503 })
  const body = objectBody(req)
  const accessToken = String(body.accessToken ?? '')
  const credential = String(body.credential ?? '')
  if (!accessToken && !credential) throw Object.assign(new Error('Google authorization is required.'), { status: 400 })
  const google = new OAuth2Client(googleClientId)
  let email: string | undefined
  let name: string | undefined
  let picture: string | undefined
  if (accessToken) {
    let tokenInfo
    try {
      tokenInfo = await google.getTokenInfo(accessToken)
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status
      if (status === 400 || status === 401) {
        throw Object.assign(new Error('Google authorization is invalid or expired. Please try again.'), { status: 401 })
      }
      throw error
    }
    const hasEmailScope = tokenInfo.scopes.some((scope) =>
      scope === 'email' || scope === 'https://www.googleapis.com/auth/userinfo.email',
    )
    if (tokenInfo.aud !== googleClientId || !tokenInfo.scopes.includes('openid') || !hasEmailScope) {
      throw Object.assign(new Error('Google authorization was not issued for this application.'), { status: 401 })
    }
    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!profileResponse.ok) {
      if (profileResponse.status === 401) {
        throw Object.assign(new Error('Google authorization is invalid or expired. Please try again.'), { status: 401 })
      }
      throw Object.assign(new Error(`Google account details could not be loaded (HTTP ${profileResponse.status}).`), { status: 502 })
    }
    const profile = await profileResponse.json() as {
      sub?: string
      email?: string
      email_verified?: boolean
      name?: string
      picture?: string
    }
    if (!profile.sub || (tokenInfo.sub && profile.sub !== tokenInfo.sub)) {
      throw Object.assign(new Error('Google account verification failed.'), { status: 401 })
    }
    email = profile.email
    name = profile.name
    picture = profile.picture
    if (!profile.email_verified) throw Object.assign(new Error('Google account email is not verified.'), { status: 401 })
  } else {
    const ticket = await google.verifyIdToken({ idToken: credential, audience: googleClientId })
    const payload = ticket.getPayload()
    if (!payload?.email || !payload.email_verified) {
      throw Object.assign(new Error('Google account email is not verified.'), { status: 401 })
    }
    email = payload.email
    name = payload.name
    picture = payload.picture
  }
  if (!email) throw Object.assign(new Error('Google account email is not available.'), { status: 401 })
  email = email.toLowerCase()
  const found = await one<AnyRow>('SELECT id, email, name, role, avatar_url AS avatarUrl FROM users WHERE email = ?', [email])
  let user = found
  if (!user) {
    const allowed = emailDomains()
    const domain = email.split('@').at(-1) ?? ''
    if (allowed.length && !allowed.some((item) => domain === item || domain.endsWith(`.${item}`))) {
      throw Object.assign(new Error(`Registration is only available to: ${allowed.join(', ')}`), { status: 403 })
    }
    const createdId = insertId(await run(
      'INSERT INTO users (email, password_hash, name, avatar_url) VALUES (?, ?, ?, ?)',
      [email, randomBytes(48).toString('hex'), name ?? email, picture ?? null],
    ))
    const plan = await one<AnyRow>('SELECT id FROM plans WHERE code = ?', ['free'])
    if (plan) await run('INSERT INTO subscriptions (user_id, plan_id) VALUES (?, ?)', [createdId, plan.id])
    user = await one<AnyRow>('SELECT id, email, name, role, avatar_url AS avatarUrl FROM users WHERE id = ?', [createdId])
  }
  if (!user) throw new Error('Could not load Google account.')
  const mapped = publicUser(user)
  res.json({ token: issueToken(mapped), user: mapped })
})

app.use('/api', (req, res, next) => {
  if (req.method === 'GET' && (
    req.path.startsWith('/files/') || req.path.startsWith('/public/shares/') || req.path.startsWith('/social/callback/')
    || req.path === '/social/data-deletion/status'
  )) {
    next()
    return
  }
  // Facebook's data-deletion callback is a server-to-server POST with no DesignHub session — it
  // authenticates itself via the signed_request's HMAC signature (checked inside the handler), not a bearer token.
  if (req.method === 'POST' && req.path === '/social/data-deletion/facebook') {
    next()
    return
  }
  requireAuth(req, res, next)
})

app.get('/api/auth/me', async (req, res) => {
  const user = await one<AnyRow>('SELECT id, email, name, role, avatar_url AS avatarUrl FROM users WHERE id = ?', [userOf(req).id])
  if (!user) throw Object.assign(new Error('Account not found.'), { status: 404 })
  res.json(publicUser(user))
})

app.patch('/api/auth/me', async (req, res) => {
  const caller = userOf(req)
  const body = objectBody(req)
  const name = typeof body.name === 'string' ? body.name.trim() : undefined
  const avatar = typeof body.avatarUrl === 'string' ? body.avatarUrl.trim() || null : undefined
  if (name !== undefined && name) await run('UPDATE users SET name = ? WHERE id = ?', [name, caller.id])
  if (avatar !== undefined) await run('UPDATE users SET avatar_url = ? WHERE id = ?', [avatar, caller.id])
  const user = await one<AnyRow>('SELECT id, email, name, role, avatar_url AS avatarUrl FROM users WHERE id = ?', [caller.id])
  if (!user) throw Object.assign(new Error('Account not found.'), { status: 404 })
  const mapped = publicUser(user)
  res.json({ token: issueToken(mapped), user: mapped })
})

app.post('/api/auth/password', async (req, res) => {
  const bcrypt = await import('bcryptjs')
  const caller = userOf(req)
  const body = objectBody(req)
  const currentPassword = String(body.currentPassword ?? '')
  const newPassword = String(body.newPassword ?? '')
  if (newPassword.length < 8) throw Object.assign(new Error('New password must be at least 8 characters.'), { status: 400 })
  const user = await one<AnyRow>('SELECT password_hash AS passwordHash FROM users WHERE id = ?', [caller.id])
  if (!user || !(await bcrypt.default.compare(currentPassword, String(user.passwordHash)))) {
    throw Object.assign(new Error('Current password is incorrect.'), { status: 400 })
  }
  await run('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.default.hash(newPassword, 11), caller.id])
  res.status(204).end()
})

app.get('/api/auth/users', async (req, res) => {
  const q = String(req.query.q ?? '').trim()
  if (q.length < 2) {
    res.json([])
    return
  }
  const found = await rows<AnyRow>(
    'SELECT id, email, name, role, avatar_url AS avatarUrl FROM users WHERE email LIKE ? OR name LIKE ? ORDER BY name LIMIT 8',
    [`%${q}%`, `%${q}%`],
  )
  res.json(found.map(publicUser))
})

app.get('/api/projects', async (req, res) => {
  const caller = userOf(req)
  const q = String(req.query.q ?? '').trim()
  const view = String(req.query.view ?? 'all')
  const page = Math.max(0, Number(req.query.page ?? 0) || 0)
  const size = Math.min(100, Math.max(1, Number(req.query.size ?? 24) || 24))
  const folderId = req.query.folderId == null ? null : Number(req.query.folderId)
  const sortField = ({ created: 'p.created_at', title: 'p.title' } as Record<string, string>)[String(req.query.sort)] ?? 'p.updated_at'
  const direction = String(req.query.sort) === 'title' ? 'ASC' : 'DESC'
  const where = ['(p.owner_id = ? OR c.user_id = ? OR tm.user_id = ? OR t.owner_id = ?)']
  const params: unknown[] = [caller.id, caller.id, caller.id, caller.id]
  if (view === 'trash') {
    where.push('p.deleted_at IS NOT NULL', 'p.owner_id = ?')
    params.push(caller.id)
  }
  else where.push('p.deleted_at IS NULL')
  if (view === 'favorites') where.push('f.id IS NOT NULL')
  if (view === 'shared') where.push('p.owner_id <> ?'), params.push(caller.id)
  if (folderId !== null && Number.isFinite(folderId)) where.push('p.folder_id = ?'), params.push(folderId)
  if (q) where.push('p.title LIKE ?'), params.push(`%${q}%`)
  const whereSql = where.join(' AND ')
  const joins = `FROM projects p LEFT JOIN teams t ON t.id = p.team_id
     LEFT JOIN team_members tm ON tm.team_id = p.team_id AND tm.user_id = ?
     LEFT JOIN collaborators c ON c.project_id = p.id AND c.user_id = ?
     LEFT JOIN favorites f ON f.project_id = p.id AND f.user_id = ?`
  const baseParams = [caller.id, caller.id, caller.id, ...params]
  const count = await one<AnyRow>(`SELECT COUNT(DISTINCT p.id) AS total ${joins} WHERE ${whereSql}`, baseParams)
  const found = await rows<AnyRow>(
    `SELECT p.id ${joins} WHERE ${whereSql} ORDER BY ${sortField} ${direction} LIMIT ? OFFSET ?`,
    [...baseParams, size, page * size],
  )
  const items = await Promise.all(found.map((row) => projectSummary(Number(row.id), caller.id)))
  res.json({ items, total: Number(count?.total ?? 0), page, size })
})

app.post('/api/projects', async (req, res) => {
  const caller = userOf(req)
  const body = objectBody(req)
  const title = String(body.title ?? '').trim()
  if (!title) throw Object.assign(new Error('Project title is required.'), { status: 400 })
  const usage = await usageOf(caller.id)
  if (usage.projects >= usage.plan.maxProjects) {
    throw Object.assign(new Error(`Your ${usage.plan.name} plan allows ${usage.plan.maxProjects} designs. Delete one or upgrade to add more.`), { status: 403 })
  }
  const template = body.templateId == null ? null : await one<AnyRow>(
    'SELECT design, width, height, thumbnail FROM templates WHERE id = ? AND published = TRUE',
    [Number(body.templateId)],
  )
  if (body.templateId != null && !template) throw Object.assign(new Error('Template not found.'), { status: 404 })
  const width = Math.max(1, Math.min(16000, Number(template?.width ?? body.width ?? 1080)))
  const height = Math.max(1, Math.min(16000, Number(template?.height ?? body.height ?? 1080)))
  if (body.folderId != null) {
    const folder = await one<AnyRow>('SELECT id FROM folders WHERE id = ? AND owner_id = ?', [Number(body.folderId), caller.id])
    if (!folder) throw Object.assign(new Error('Folder not found.'), { status: 404 })
  }
  if (body.teamId != null) {
    const team = await one<AnyRow>(
      'SELECT t.id FROM teams t LEFT JOIN team_members m ON m.team_id = t.id AND m.user_id = ? WHERE t.id = ? AND (t.owner_id = ? OR m.user_id IS NOT NULL)',
      [caller.id, Number(body.teamId), caller.id],
    )
    if (!team) throw Object.assign(new Error('You are not a member of that team.'), { status: 403 })
  }
  const projectId = insertId(await run(
    'INSERT INTO projects (owner_id, title, width, height, team_id, folder_id, thumbnail) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [caller.id, title, width, height, body.teamId ?? null, body.folderId ?? null, template?.thumbnail ?? null],
  ))
  if (template) await replaceDesign(projectId, jsonValue(template.design), width, height, true)
  else await replaceDesign(projectId, {
    width, height, pages: [{ id: randomBytes(18).toString('hex'), name: 'Page 1', background: '#ffffff', position: 0, elements: [] }],
  })
  await run('INSERT INTO activities (actor_id, project_id, type) VALUES (?, ?, ?)', [caller.id, projectId, 'project.created'])
  res.status(201).json(await projectSummary(projectId, caller.id))
})

app.get('/api/projects/:id', async (req, res) => {
  const projectId = idOf(req.params.id)
  await requireProjectAccess(projectId, userOf(req).id)
  res.json(await projectSummary(projectId, userOf(req).id))
})

app.patch('/api/projects/:id', async (req, res) => {
  const caller = userOf(req)
  const projectId = idOf(req.params.id)
  const body = objectBody(req)
  const changesOwnershipFields = body.title !== undefined || (body.folderId !== undefined && body.folderId !== null) ||
    body.clearFolder === true || (body.teamId !== undefined && body.teamId !== null)
  const role = await requireProjectAccess(projectId, caller.id, changesOwnershipFields)
  if (changesOwnershipFields && role !== 'OWNER') {
    throw Object.assign(new Error('Only the project owner can change the title, folder, or team.'), { status: 403 })
  }
  if (body.teamId !== undefined) {
    const current = await one<AnyRow>('SELECT team_id AS teamId FROM projects WHERE id = ?', [projectId])
    const currentTeamId = current?.teamId == null ? null : Number(current.teamId)
    const nextTeamId = Number(body.teamId) || null
    if (currentTeamId !== null && nextTeamId !== currentTeamId && await teamWorkflowRole(projectId, caller.id) !== 'ADMIN') {
      throw Object.assign(new Error('Only a team Admin can move a design out of its team or into another team.'), { status: 403 })
    }
  }
  const updates: string[] = []
  const values: unknown[] = []
  if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim())) {
    throw Object.assign(new Error('Project title is required.'), { status: 400 })
  }
  if (typeof body.title === 'string') updates.push('title = ?'), values.push(body.title.trim())
  if (typeof body.thumbnail === 'string') updates.push('thumbnail = ?'), values.push(body.thumbnail)
  if (body.clearFolder === true) updates.push('folder_id = NULL')
  else if (body.folderId !== undefined && body.folderId !== null) {
    const folderId = Number(body.folderId)
    const folder = await one<AnyRow>('SELECT id FROM folders WHERE id = ? AND owner_id = ?', [folderId, caller.id])
    if (!folder) throw Object.assign(new Error('Folder not found.'), { status: 404 })
    updates.push('folder_id = ?')
    values.push(folderId)
  }
  if (body.teamId !== undefined && body.teamId !== null) {
    const teamId = Number(body.teamId)
    if (teamId === 0) updates.push('team_id = NULL')
    else {
      const team = await one<AnyRow>(
        'SELECT t.id FROM teams t LEFT JOIN team_members m ON m.team_id = t.id AND m.user_id = ? WHERE t.id = ? AND (t.owner_id = ? OR m.user_id IS NOT NULL)',
        [caller.id, teamId, caller.id],
      )
      if (!team) throw Object.assign(new Error('You are not a member of that team.'), { status: 403 })
      updates.push('team_id = ?')
      values.push(teamId)
    }
  }
  if (updates.length) await run(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`, [...values, projectId])
  res.json(await projectSummary(projectId, caller.id))
})

app.post('/api/projects/:id/duplicate', async (req, res) => {
  const caller = userOf(req)
  const sourceId = idOf(req.params.id)
  await requireProjectAccess(sourceId, caller.id)
  const usage = await usageOf(caller.id)
  if (usage.projects >= usage.plan.maxProjects) {
    throw Object.assign(new Error(`Your ${usage.plan.name} plan allows ${usage.plan.maxProjects} designs. Delete one or upgrade to add more.`), { status: 403 })
  }
  const source = await one<AnyRow>('SELECT title, width, height, thumbnail, team_id AS teamId FROM projects WHERE id = ?', [sourceId])
  if (!source) throw Object.assign(new Error('Project not found.'), { status: 404 })
  const projectId = insertId(await run(
    'INSERT INTO projects (owner_id, team_id, title, width, height, thumbnail) VALUES (?, ?, ?, ?, ?, ?)',
    [caller.id, source.teamId ?? null, `${source.title} copy`, source.width, source.height, source.thumbnail],
  ))
  const design = await loadDesign(sourceId)
  await replaceDesign(projectId, design, Number(source.width), Number(source.height), true)
  res.status(201).json(await projectSummary(projectId, caller.id))
})

app.post('/api/projects/:id/trash', async (req, res) => {
  const projectId = idOf(req.params.id)
  const caller = userOf(req)
  if (await requireProjectAccess(projectId, caller.id) !== 'OWNER') {
    throw Object.assign(new Error('Only the project owner can move it to trash.'), { status: 403 })
  }
  await run('UPDATE projects SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [projectId])
  await run('INSERT INTO activities (actor_id, project_id, type) VALUES (?, ?, ?)', [caller.id, projectId, 'project.trashed'])
  res.status(204).end()
})

app.post('/api/projects/:id/restore', async (req, res) => {
  const projectId = idOf(req.params.id)
  const caller = userOf(req)
  if (await requireProjectAccess(projectId, caller.id) !== 'OWNER') {
    throw Object.assign(new Error('Only the project owner can restore it.'), { status: 403 })
  }
  await run('UPDATE projects SET deleted_at = NULL WHERE id = ?', [projectId])
  await run('INSERT INTO activities (actor_id, project_id, type) VALUES (?, ?, ?)', [caller.id, projectId, 'project.restored'])
  res.status(204).end()
})

app.delete('/api/projects/:id', async (req, res) => {
  const projectId = idOf(req.params.id)
  const caller = userOf(req)
  const role = await requireProjectAccess(projectId, caller.id, true)
  if (role !== 'OWNER') throw Object.assign(new Error('Only the project owner can permanently delete it.'), { status: 403 })
  const project = await one<AnyRow>('SELECT deleted_at AS deletedAt FROM projects WHERE id = ?', [projectId])
  if (!project?.deletedAt) throw Object.assign(new Error('Move the design to trash before deleting it permanently.'), { status: 400 })
  await db().execute('DELETE e FROM elements e JOIN pages pg ON pg.id = e.page_id WHERE pg.project_id = ?', [projectId])
  for (const table of ['pages', 'versions', 'comments', 'collaborators', 'share_links', 'favorites', 'activities', 'design_approvals']) {
    await run(`DELETE FROM ${table} WHERE project_id = ?`, [projectId])
  }
  await run('UPDATE social_posts SET project_id = NULL WHERE project_id = ?', [projectId])
  await run('UPDATE exports SET project_id = NULL WHERE project_id = ?', [projectId])
  await run('DELETE FROM projects WHERE id = ?', [projectId])
  res.status(204).end()
})

async function loadDesign(projectId: number) {
  const project = await one<AnyRow>('SELECT id, width, height, revision FROM projects WHERE id = ?', [projectId])
  if (!project) throw Object.assign(new Error('Project not found.'), { status: 404 })
  const pages = await rows<AnyRow>(
    'SELECT id, name, background, duration_seconds AS durationSeconds, position, notes FROM pages WHERE project_id = ? ORDER BY position',
    [projectId],
  )
  const elements = pages.length
    ? await rows<AnyRow>(
        `SELECT e.id, e.type, e.z_index AS zIndex, e.data, e.page_id AS pageId
         FROM elements e JOIN pages pg ON pg.id = e.page_id WHERE pg.project_id = ? ORDER BY e.z_index`,
        [projectId],
      )
    : []
  return {
    projectId,
    revision: Number(project.revision),
    width: Number(project.width),
    height: Number(project.height),
    pages: pages.map((page) => ({
      id: String(page.id),
      name: page.name,
      background: page.background,
      durationSeconds: page.durationSeconds == null ? null : Number(page.durationSeconds),
      position: Number(page.position),
      notes: page.notes,
      elements: elements
        .filter((element) => element.pageId === page.id)
        .map((element) => ({ id: String(element.id), type: String(element.type), zIndex: Number(element.zIndex), data: jsonValue(element.data) })),
    })),
  }
}

async function replaceDesign(projectId: number, input: unknown, fallbackWidth?: number, fallbackHeight?: number, remapIds = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('Design document must be an object.'), { status: 400 })
  const doc = input as Record<string, unknown>
  const pageList = Array.isArray(doc.pages) ? doc.pages as Record<string, unknown>[] : []
  if (!remapIds) {
    const pageIds = pageList.map((page) => String(page.id ?? ''))
    const elementIds = pageList.flatMap((page) => Array.isArray(page.elements)
      ? (page.elements as Record<string, unknown>[]).map((element) => String(element.id ?? ''))
      : [])
    if (pageIds.some((id) => !id || id.length > 36) || new Set(pageIds).size !== pageIds.length) {
      throw Object.assign(new Error('Page ids must be unique and no longer than 36 characters.'), { status: 400 })
    }
    if (elementIds.some((id) => !id || id.length > 36) || new Set(elementIds).size !== elementIds.length) {
      throw Object.assign(new Error('Element ids must be unique and no longer than 36 characters.'), { status: 400 })
    }
    if (pageIds.length) {
      const conflict = await one<AnyRow>(
        `SELECT id FROM pages WHERE project_id <> ? AND id IN (${pageIds.map(() => '?').join(',')}) LIMIT 1`,
        [projectId, ...pageIds],
      )
      if (conflict) throw Object.assign(new Error('A page belongs to another design.'), { status: 403 })
    }
    if (elementIds.length) {
      const conflict = await one<AnyRow>(
        `SELECT e.id FROM elements e JOIN pages p ON p.id = e.page_id
         WHERE p.project_id <> ? AND e.id IN (${elementIds.map(() => '?').join(',')}) LIMIT 1`,
        [projectId, ...elementIds],
      )
      if (conflict) throw Object.assign(new Error('An element belongs to another design.'), { status: 403 })
    }
  }
  const connection = await db().getConnection()
  try {
    await connection.beginTransaction()
    await connection.execute('DELETE e FROM elements e JOIN pages pg ON pg.id = e.page_id WHERE pg.project_id = ?', sqlValues([projectId]))
    await connection.execute('DELETE FROM pages WHERE project_id = ?', sqlValues([projectId]))
    for (let i = 0; i < pageList.length; i++) {
      const page = pageList[i]!
      const pageId = remapIds ? randomBytes(18).toString('hex') : String(page.id ?? randomBytes(12).toString('hex'))
      await connection.execute(
        'INSERT INTO pages (id, project_id, position, name, background, duration_seconds, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        sqlValues([pageId, projectId, Number(page.position ?? i), page.name ?? null, page.background ?? null, page.durationSeconds ?? null, page.notes ?? null]),
      )
      const elements = Array.isArray(page.elements) ? page.elements as Record<string, unknown>[] : []
      for (const element of elements) {
        await connection.execute(
          'INSERT INTO elements (id, page_id, type, z_index, data) VALUES (?, ?, ?, ?, ?)',
          sqlValues([remapIds ? randomBytes(18).toString('hex') : String(element.id), pageId, String(element.type), Number(element.zIndex ?? 0), JSON.stringify(element.data ?? {})]),
        )
      }
    }
    const width = Number(doc.width ?? fallbackWidth ?? 1080)
    const height = Number(doc.height ?? fallbackHeight ?? 1080)
    await connection.execute('UPDATE projects SET width = ?, height = ?, revision = revision + 1 WHERE id = ?', sqlValues([width, height, projectId]))
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

app.get('/api/projects/:id/design', async (req, res) => {
  const projectId = idOf(req.params.id)
  await requireProjectAccess(projectId, userOf(req).id)
  res.json(await loadDesign(projectId))
})

app.put('/api/projects/:id/design', async (req, res) => {
  const projectId = idOf(req.params.id)
  await requireProjectAccess(projectId, userOf(req).id, true)
  await replaceDesign(projectId, req.body)
  await publishApprovalRevision(projectId)
  const project = await one<AnyRow>('SELECT revision FROM projects WHERE id = ?', [projectId])
  res.json({ revision: Number(project?.revision ?? 0) })
})

app.post('/api/projects/:id/favorite', async (req, res) => {
  const caller = userOf(req)
  const projectId = idOf(req.params.id)
  await requireProjectAccess(projectId, caller.id)
  const exists = await one<AnyRow>('SELECT id FROM favorites WHERE user_id = ? AND project_id = ?', [caller.id, projectId])
  if (exists) await run('DELETE FROM favorites WHERE id = ?', [exists.id])
  else await run('INSERT INTO favorites (user_id, project_id) VALUES (?, ?)', [caller.id, projectId])
  res.json({ favorite: !exists })
})

app.get('/api/categories/folders', async (req, res) => {
  const found = await rows<AnyRow>('SELECT id, name FROM folders WHERE owner_id = ? ORDER BY name', [userOf(req).id])
  res.json(found.map((folder) => ({ id: Number(folder.id), name: String(folder.name) })))
})

app.post('/api/categories/folders', async (req, res) => {
  const name = String(objectBody(req).name ?? '').trim()
  if (!name) throw Object.assign(new Error('Folder name is required.'), { status: 400 })
  const id = insertId(await run('INSERT INTO folders (owner_id, name) VALUES (?, ?)', [userOf(req).id, name]))
  res.status(201).json({ id, name })
})

app.patch('/api/categories/folders/:id', async (req, res) => {
  const folderId = idOf(req.params.id)
  const caller = userOf(req)
  const name = String(objectBody(req).name ?? '').trim()
  if (!name) throw Object.assign(new Error('Folder name is required.'), { status: 400 })
  const existing = await one<AnyRow>('SELECT id FROM folders WHERE id = ? AND owner_id = ?', [folderId, caller.id])
  if (!existing) throw Object.assign(new Error('Folder not found.'), { status: 404 })
  await run('UPDATE folders SET name = ? WHERE id = ? AND owner_id = ?', [name, folderId, caller.id])
  res.json({ id: folderId, name })
})

app.delete('/api/categories/folders/:id', async (req, res) => {
  const folderId = idOf(req.params.id)
  const folder = await one<AnyRow>('SELECT id FROM folders WHERE id = ? AND owner_id = ?', [folderId, userOf(req).id])
  if (!folder) throw Object.assign(new Error('Folder not found.'), { status: 404 })
  await run('UPDATE projects SET folder_id = NULL WHERE folder_id = ? AND owner_id = ?', [folderId, userOf(req).id])
  await run('DELETE FROM folders WHERE id = ? AND owner_id = ?', [folderId, userOf(req).id])
  res.status(204).end()
})

app.get('/api/versions/project/:projectId', async (req, res) => {
  const projectId = idOf(req.params.projectId)
  await requireProjectAccess(projectId, userOf(req).id)
  const found = await rows<AnyRow>(
    `SELECT v.id, v.label, v.auto, v.created_at AS createdAt, v.thumbnail, u.name AS authorName
     FROM versions v LEFT JOIN users u ON u.id = v.author_id WHERE v.project_id = ? ORDER BY v.created_at DESC`,
    [projectId],
  )
  res.json(found.map((version) => ({
    id: Number(version.id), label: version.label ?? '', auto: Boolean(version.auto),
    createdAt: new Date(String(version.createdAt)).toISOString(),
    ...(version.thumbnail ? { thumbnail: String(version.thumbnail) } : {}),
    ...(version.authorName ? { authorName: String(version.authorName) } : {}),
  })))
})

app.post('/api/versions/project/:projectId', async (req, res) => {
  const projectId = idOf(req.params.projectId)
  const caller = userOf(req)
  await requireProjectAccess(projectId, caller.id, true)
  const body = objectBody(req)
  const id = insertId(await run(
    'INSERT INTO versions (project_id, author_id, label, auto, snapshot, thumbnail) VALUES (?, ?, ?, ?, ?, ?)',
    [projectId, caller.id, String(body.label ?? '').slice(0, 160), Boolean(body.auto), JSON.stringify(await loadDesign(projectId)), body.thumbnail ?? null],
  ))
  const saved = await one<AnyRow>('SELECT id, label, auto, created_at AS createdAt, thumbnail FROM versions WHERE id = ?', [id])
  res.status(201).json({
    id, label: saved?.label ?? '', auto: Boolean(saved?.auto),
    createdAt: new Date(String(saved?.createdAt)).toISOString(),
    ...(saved?.thumbnail ? { thumbnail: String(saved.thumbnail) } : {}),
    authorName: caller.name,
  })
})

app.post('/api/versions/project/:projectId/:versionId/restore', async (req, res) => {
  const caller = userOf(req)
  const projectId = idOf(req.params.projectId)
  const versionId = idOf(req.params.versionId)
  await requireProjectAccess(projectId, caller.id, true)
  const version = await one<AnyRow>('SELECT snapshot FROM versions WHERE id = ? AND project_id = ?', [versionId, projectId])
  if (!version) throw Object.assign(new Error('Version not found.'), { status: 404 })
  await replaceDesign(projectId, jsonValue(version.snapshot))
  res.status(204).end()
})

app.delete('/api/versions/project/:projectId/:versionId', async (req, res) => {
  const projectId = idOf(req.params.projectId)
  const versionId = idOf(req.params.versionId)
  await requireProjectAccess(projectId, userOf(req).id, true)
  await run('DELETE FROM versions WHERE id = ? AND project_id = ?', [versionId, projectId])
  res.status(204).end()
})

app.get('/api/preferences', async (req, res) => {
  const prefs = await rows<AnyRow>('SELECT pref_key AS `key`, pref_value AS value FROM preferences WHERE user_id = ?', [userOf(req).id])
  res.json(Object.fromEntries(prefs.map((pref) => [String(pref.key), String(pref.value ?? '')])))
})

app.put('/api/preferences/:key', async (req, res) => {
  const key = String(req.params.key)
  const value = String(objectBody(req).value ?? '')
  await run(
    'INSERT INTO preferences (user_id, pref_key, pref_value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE pref_value = VALUES(pref_value)',
    [userOf(req).id, key, value],
  )
  res.status(204).end()
})

const defaultEmailSettings = { comments: true, mentions: true, invitations: true, approvals: true, productUpdates: true }
app.get('/api/email-settings', async (req, res) => {
  const settings = await one<AnyRow>(
    'SELECT comments, mentions, invitations, approvals, product_updates AS productUpdates FROM email_settings WHERE user_id = ?',
    [userOf(req).id],
  )
  res.json(settings ?? defaultEmailSettings)
})

app.put('/api/email-settings', async (req, res) => {
  const caller = userOf(req)
  const body = objectBody(req)
  const value = Object.fromEntries(Object.keys(defaultEmailSettings).map((key) => [key, body[key] !== false]))
  await run(
    `INSERT INTO email_settings (user_id, comments, mentions, invitations, approvals, product_updates)
     VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE comments = VALUES(comments), mentions = VALUES(mentions),
       invitations = VALUES(invitations), approvals = VALUES(approvals), product_updates = VALUES(product_updates)`,
    [caller.id, value.comments, value.mentions, value.invitations, value.approvals, value.productUpdates],
  )
  res.json(value)
})

app.get('/api/ai-settings', async (req, res) => {
  const caller = userOf(req)
  const saved = await rows<AnyRow>(
    'SELECT provider, encrypted_key AS encryptedKey, text_model AS textModel, image_model AS imageModel, base_url AS baseUrl, active FROM ai_settings WHERE user_id = ?',
    [caller.id],
  )
  const byProvider = new Map(saved.map((setting) => [String(setting.provider), setting]))
  res.json(Object.entries(aiProviders).sort(([a], [b]) => a.localeCompare(b)).map(([provider, info]) => {
    const setting = byProvider.get(provider)
    const hint = setting ? decryptSecret(String(setting.encryptedKey)) : ''
    return {
      provider,
      ...(hint ? { keyHint: `${'•'.repeat(Math.max(0, hint.length - 4))}${hint.slice(-4)}` } : {}),
      ...(setting?.textModel ? { textModel: String(setting.textModel) } : {}),
      ...(setting?.imageModel ? { imageModel: String(setting.imageModel) } : {}),
      ...(setting?.baseUrl ? { baseUrl: String(setting.baseUrl) } : {}),
      active: Boolean(setting?.active),
      supportsImages: info.supportsImages,
      defaultTextModel: info.text,
      defaultImageModel: info.image,
    }
  }))
})

async function saveAiSetting(userId: number, providerName: string, body: Record<string, unknown>) {
  if (!(providerName in aiProviders)) throw Object.assign(new Error('AI provider not found.'), { status: 404 })
  const provider = providerName as AiProvider
  const apiKey = typeof body.apiKey === 'string' && body.apiKey.trim() ? body.apiKey.trim() : null
  const textModel = typeof body.textModel === 'string' ? body.textModel.trim() || null : null
  const imageModel = typeof body.imageModel === 'string' ? body.imageModel.trim() || null : null
  const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() || null : null
  if (apiKey && apiKey.length > 400) throw Object.assign(new Error('API key is too long.'), { status: 400 })
  if (textModel && textModel.length > 120 || imageModel && imageModel.length > 120 || baseUrl && baseUrl.length > 300) {
    throw Object.assign(new Error('Provider settings exceed the allowed length.'), { status: 400 })
  }
  await validateAiBaseUrl(baseUrl)
  const existing = await one<AnyRow>(
    'SELECT encrypted_key AS encryptedKey, active FROM ai_settings WHERE user_id = ? AND provider = ?',
    [userId, provider],
  )
  if (!existing && !apiKey) throw Object.assign(new Error('Paste an API key to connect this provider.'), { status: 400 })
  const encrypted = apiKey ? encryptSecret(apiKey) : String(existing?.encryptedKey)
  const active = body.active === undefined ? (existing ? Boolean(existing.active) : true) : Boolean(body.active)
  await run(
    `INSERT INTO ai_settings (user_id, provider, encrypted_key, text_model, image_model, base_url, active)
     VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE encrypted_key = VALUES(encrypted_key),
       text_model = VALUES(text_model), image_model = VALUES(image_model), base_url = VALUES(base_url), active = VALUES(active)`,
    [userId, provider, encrypted, textModel, imageModel, baseUrl, active],
  )
  if (active) await run('UPDATE ai_settings SET active = FALSE WHERE user_id = ? AND provider <> ?', [userId, provider])
}

app.put('/api/ai-settings/:provider', async (req, res) => {
  await saveAiSetting(userOf(req).id, String(req.params.provider), objectBody(req))
  res.status(204).end()
})

app.delete('/api/ai-settings/:provider', async (req, res) => {
  if (!(String(req.params.provider) in aiProviders)) throw Object.assign(new Error('AI provider not found.'), { status: 404 })
  await run('DELETE FROM ai_settings WHERE user_id = ? AND provider = ?', [userOf(req).id, String(req.params.provider)])
  res.status(204).end()
})

app.get('/api/ai-settings/usage', async (req, res) => {
  const found = await rows<AnyRow>(
    `SELECT provider, kind, COUNT(*) AS requests, SUM(prompt_chars + output_chars) AS characters
     FROM ai_usage WHERE user_id = ? AND created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 DAY)
     GROUP BY provider, kind ORDER BY provider, kind`,
    [userOf(req).id],
  )
  res.json(found.map((item) => ({ provider: String(item.provider), kind: String(item.kind), requests: Number(item.requests), characters: Number(item.characters ?? 0) })))
})

app.post('/api/ai-settings/:provider/test', async (req, res) => {
  const caller = userOf(req)
  const providerName = String(req.params.provider)
  if (!(providerName in aiProviders)) throw Object.assign(new Error('AI provider not found.'), { status: 404 })
  const provider = providerName as AiProvider
  const body = objectBody(req)
  const saved = await one<AnyRow>(
    'SELECT encrypted_key AS encryptedKey, text_model AS textModel, base_url AS baseUrl FROM ai_settings WHERE user_id = ? AND provider = ?',
    [caller.id, provider],
  )
  const key = typeof body.apiKey === 'string' && body.apiKey.trim()
    ? body.apiKey.trim()
    : saved ? decryptSecret(String(saved.encryptedKey)) : ''
  if (!key) throw Object.assign(new Error('Paste an API key first.'), { status: 400 })
  const model = String(body.textModel ?? saved?.textModel ?? aiProviders[provider].text)
  const base = String(body.baseUrl ?? saved?.baseUrl ?? '').trim() || null
  await validateAiBaseUrl(base)
  const startedAt = Date.now()
  try {
    const reply = await aiText(provider, key, model, base, 'You are a connection test. Answer in one short sentence.', 'Reply with the word OK and nothing else.')
    const latencyMs = Date.now() - startedAt
    if (body.useIfWorks === true) await saveAiSetting(caller.id, provider, { apiKey: key, textModel: model, baseUrl: base, active: true })
    const shortReply = reply.trim().slice(0, 80)
    res.json({ ok: true, message: `Connected. ${model} answered in ${latencyMs} ms.`, model, latencyMs, reply: shortReply })
  } catch (error) {
    res.json({
      ok: false,
      message: (error as Error).message || 'The provider returned an unreadable response.',
      model,
      latencyMs: Date.now() - startedAt,
    })
  }
})

app.post('/api/ai/text', async (req, res) => {
  const caller = userOf(req)
  const body = objectBody(req)
  const prompt = String(body.prompt ?? '')
  if (!prompt.trim() || prompt.length > 4000) throw Object.assign(new Error('Prompt must be between 1 and 4000 characters.'), { status: 400 })
  const usage = await usageOf(caller.id)
  if (usage.aiRequests >= usage.plan.aiRequestsPerMonth) {
    throw Object.assign(new Error(`You have used all ${usage.plan.aiRequestsPerMonth} AI requests included in your ${usage.plan.name} plan this month.`), { status: 403 })
  }
  const setting = await activeAiSettings(caller.id)
  const system = typeof body.instruction === 'string' && body.instruction.trim()
    ? body.instruction.trim().slice(0, 600)
    : 'You are a concise copywriter for graphic designs. Reply with the copy only, no preamble or quotes.'
  const text = await trackAi(caller.id, setting.provider, 'text', setting.textModel, prompt, () =>
    aiText(setting.provider, setting.key, setting.textModel, setting.baseUrl, system, prompt), (result) => result.length)
  res.json({ text })
})

app.post('/api/ai/design', async (req, res) => {
  const caller = userOf(req)
  const body = objectBody(req)
  const brief = String(body.brief ?? '')
  const width = Number(body.width)
  const height = Number(body.height)
  if (!brief.trim() || brief.length > 2000 || !Number.isFinite(width) || !Number.isFinite(height) || width < 64 || height < 64 || width > 16000 || height > 16000) {
    throw Object.assign(new Error('Enter a brief and valid canvas dimensions.'), { status: 400 })
  }
  const system = 'You are a senior graphic designer. Reply with JSON only: {"background":"#RRGGBB","elements":[{"type":"text","text":"...","x":0,"y":0,"width":300,"fontSize":48,"fontFamily":"Inter","fontWeight":700,"fill":"#151515","align":"left"},{"type":"shape","shape":"rect|ellipse|triangle|star|line","x":0,"y":0,"width":200,"height":100,"fill":"#FF5A36"}]}. Keep content within canvas margins, use at most 8 elements, and write specific copy.'
  const prompt = `Canvas: ${width}x${height} px.\nBrief: ${brief}${body.brand ? `\nBrand: ${String(body.brand).slice(0, 500)}` : ''}`
  const usage = await usageOf(caller.id)
  if (usage.aiRequests >= usage.plan.aiRequestsPerMonth) {
    throw Object.assign(new Error(`You have used all ${usage.plan.aiRequestsPerMonth} AI requests included in your ${usage.plan.name} plan this month.`), { status: 403 })
  }
  const setting = await activeAiSettings(caller.id)
  const raw = await trackAi(caller.id, setting.provider, 'text', setting.textModel, prompt, () =>
    aiText(setting.provider, setting.key, setting.textModel, setting.baseUrl, system, prompt), (result) => result.length)
  const fenced = raw.trim().replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '')
  const start = fenced.indexOf('{')
  const end = fenced.lastIndexOf('}')
  let layout: Record<string, unknown>
  try {
    layout = JSON.parse(start >= 0 && end > start ? fenced.slice(start, end + 1) : fenced) as Record<string, unknown>
  } catch {
    throw Object.assign(new Error('The AI reply could not be turned into a layout. Try rephrasing your brief.'), { status: 502 })
  }
  const color = (value: unknown, fallback: string) => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback
  const elements: { id: string; type: 'text' | 'shape'; zIndex: number; data: Record<string, unknown> }[] = []
  const rawElements = Array.isArray(layout.elements) ? layout.elements : []
  rawElements.slice(0, 12).forEach((rawElement, zIndex) => {
    if (!rawElement || typeof rawElement !== 'object') return
    const element = rawElement as Record<string, unknown>
    const x = Math.max(0, Math.min(width, Number(element.x) || 0))
    const y = Math.max(0, Math.min(height, Number(element.y) || 0))
    if (element.type === 'text') {
      elements.push({
        id: randomBytes(16).toString('hex'), type: 'text', zIndex,
        data: {
          x, y, width: Math.max(20, Math.min(width - x, Number(element.width) || width * 0.6)),
          text: String(element.text ?? '').slice(0, 400), fontSize: Math.max(8, Math.min(400, Number(element.fontSize) || 48)),
          fontFamily: String(element.fontFamily ?? 'Inter').slice(0, 60),
          fontWeight: Math.max(100, Math.min(900, Number(element.fontWeight) || 400)),
          fill: color(element.fill, '#151515'), align: ['left', 'center', 'right'].includes(String(element.align)) ? String(element.align) : 'left',
          rotation: 0, opacity: 1,
        },
      })
      return
    }
    if (element.type === 'shape' && ['rect', 'ellipse', 'triangle', 'star', 'line', 'arrow', 'polygon'].includes(String(element.shape))) {
      elements.push({
        id: randomBytes(16).toString('hex'), type: 'shape', zIndex,
        data: {
          x, y, shape: String(element.shape), width: Math.max(1, Math.min(width, Number(element.width) || 200)),
          height: Math.max(1, Math.min(height, Number(element.height) || 200)),
          fill: color(element.fill, '#FF5A36'), cornerRadius: Math.max(0, Number(element.cornerRadius) || 0),
          strokeWidth: 0, rotation: 0, opacity: 1,
        },
      })
    }
  })
  res.json({ background: color(layout.background, '#ffffff'), elements })
})

app.post('/api/ai/image', async (req, res) => {
  const caller = userOf(req)
  const body = objectBody(req)
  const prompt = String(body.prompt ?? '')
  const width = Math.max(64, Math.min(4096, Number(body.width ?? 1024)))
  const height = Math.max(64, Math.min(4096, Number(body.height ?? 1024)))
  if (!prompt.trim() || prompt.length > 2000) throw Object.assign(new Error('Prompt must be between 1 and 2000 characters.'), { status: 400 })
  const usage = await usageOf(caller.id)
  if (usage.aiRequests >= usage.plan.aiRequestsPerMonth) {
    throw Object.assign(new Error(`You have used all ${usage.plan.aiRequestsPerMonth} AI requests included in your ${usage.plan.name} plan this month.`), { status: 403 })
  }
  const environmentImageKey = process.env.AI_IMAGE_API_KEY?.trim()
  const environmentImageProvider = (process.env.AI_IMAGE_PROVIDER?.trim().toLowerCase() || 'openai-compatible')
  if (environmentImageKey && !['openai-compatible', 'huggingface'].includes(environmentImageProvider)) {
    throw Object.assign(new Error('AI_IMAGE_PROVIDER must be openai-compatible or huggingface.'), { status: 503 })
  }
  const setting = environmentImageKey
    ? environmentImageProvider === 'huggingface'
      ? {
          provider: 'huggingface' as const,
          key: environmentImageKey,
          imageModel: process.env.AI_IMAGE_MODEL?.trim() ?? '',
          baseUrl: process.env.AI_IMAGE_HUGGINGFACE_BASE_URL?.trim() || 'https://router.huggingface.co/hf-inference/models',
        }
      : {
          provider: 'openai' as const,
          key: environmentImageKey,
          imageModel: process.env.AI_IMAGE_MODEL?.trim() ?? '',
          baseUrl: process.env.AI_IMAGE_BASE_URL?.trim() || 'https://api.openai.com/v1',
        }
    : await activeAiSettings(caller.id, true)
  if (environmentImageKey && !setting.imageModel) {
    throw Object.assign(new Error('AI_IMAGE_MODEL must be configured when AI_IMAGE_API_KEY is set.'), { status: 503 })
  }
  if (setting.provider === 'huggingface' && !/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(setting.imageModel)) {
    throw Object.assign(new Error('AI_IMAGE_MODEL must be a Hugging Face model ID in owner/model format.'), { status: 503 })
  }
  if (environmentImageKey) await validateAiBaseUrl(setting.baseUrl)
  const usageProvider = environmentImageKey ? 'environment' : setting.provider
  const asset = await trackAi(caller.id, usageProvider, 'image', setting.imageModel, prompt, async () => {
    let bytes: Buffer
    let mime = 'image/png'
    if (setting.provider === 'huggingface') {
      const base = setting.baseUrl!.replace(/\/+$/, '')
      const modelPath = setting.imageModel.split('/').map(encodeURIComponent).join('/')
      const image = await postHuggingFaceImage(`${base}/${modelPath}`, setting.key, {
        inputs: prompt,
        parameters: { width, height },
      })
      bytes = image.bytes
      mime = image.mime
    } else if (setting.provider === 'google') {
      const data = await postProviderJson(
        `${(setting.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '')}/models/${encodeURIComponent(setting.imageModel)}:generateContent`,
        { 'x-goog-api-key': setting.key },
        { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } },
      )
      const candidates = data.candidates as { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[] | undefined
      const image = candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData
      if (!image?.data) throw Object.assign(new Error('The AI provider returned no image.'), { status: 502 })
      bytes = Buffer.from(image.data, 'base64')
      mime = image.mimeType ?? mime
    } else {
      const base = (setting.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '')
      const data = await postProviderJson(`${base}/images/generations`, { authorization: `Bearer ${setting.key}` }, {
        model: setting.imageModel,
        prompt,
        size: width > height * 1.2 ? '1536x1024' : height > width * 1.2 ? '1024x1536' : '1024x1024',
        n: 1,
      })
      const image = (data.data as { b64_json?: string }[] | undefined)?.[0]
      if (!image?.b64_json) throw Object.assign(new Error('The AI provider returned no image.'), { status: 502 })
      bytes = Buffer.from(image.b64_json, 'base64')
    }
    const extension = mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png'
    return persistBuffer(caller, bytes, `ai-image.${extension}`, mime, 'image')
  }, (result) => result.sizeBytes)
  res.json(asset)
})

async function approvalView(projectId: number, userId: number) {
  const role = await requireProjectAccess(projectId, userId)
  const workflowRole = await teamWorkflowRole(projectId, userId)
  const project = await one<AnyRow>(
    `SELECT p.team_id AS teamId, p.revision, t.name AS teamName
     FROM projects p LEFT JOIN teams t ON t.id = p.team_id WHERE p.id = ?`,
    [projectId],
  )
  if (!project) throw Object.assign(new Error('Project not found.'), { status: 404 })
  const approval = await one<AnyRow>(
    `SELECT a.id, a.status, a.requested_by_id AS requestedById, maker.name AS requestedBy,
      a.message, a.feedback, a.caption, editor.name AS decidedBy, a.decided_at AS decidedAt,
      a.created_at AS requestedAt, a.approved_revision AS approvedRevision
     FROM design_approvals a JOIN users maker ON maker.id = a.requested_by_id
     LEFT JOIN users editor ON editor.id = a.decided_by_id
     WHERE a.project_id = ? ORDER BY a.id DESC LIMIT 1`,
    [projectId],
  )
  const history = await rows<AnyRow>(
    `SELECT a.id, a.status, a.message, a.feedback, a.created_at AS submittedAt, a.decided_at AS reviewedAt,
       submitter.id AS submittedById, submitter.name AS submittedBy,
       reviewer.id AS reviewedById, reviewer.name AS reviewedBy
     FROM design_approvals a
     JOIN users submitter ON submitter.id = a.requested_by_id
     LEFT JOIN users reviewer ON reviewer.id = a.decided_by_id
     WHERE a.project_id = ? ORDER BY a.id ASC`,
    [projectId],
  )
  const teamId = project.teamId == null ? null : Number(project.teamId)
  const isEditor = Boolean(teamId && await one<AnyRow>(
    'SELECT id FROM teams WHERE id = ? AND owner_id = ? UNION SELECT id FROM team_members WHERE team_id = ? AND user_id = ? AND role = ? LIMIT 1',
    [teamId, userId, teamId, userId, 'EDITOR'],
  ))
  const isAdmin = await isApprovalAdmin(userId)
  let status = teamId ? String(approval?.status ?? 'NONE') : 'NO_TEAM'
  if (!teamId && await userHasMakerRole(userId)) status = 'NEEDS_TEAM'
  if (status === 'CANCELLED') status = 'NONE'
  if (status === 'APPROVED' && Number(approval?.approvedRevision) !== Number(project.revision)) status = 'EXPIRED'
  const pending = status === 'PENDING'
  const mine = approval != null && Number(approval.requestedById) === userId
  const reviewers = teamId
    ? await rows<AnyRow>(
        `SELECT u.name FROM teams t JOIN users u ON u.id = t.owner_id WHERE t.id = ?
         UNION SELECT u.name FROM team_members m JOIN users u ON u.id = m.user_id
         WHERE m.team_id = ? AND m.role = 'EDITOR' ORDER BY name`,
        [teamId, teamId],
      )
    : []
  return {
    status,
    ...(approval ? {
      id: Number(approval.id), requestedById: Number(approval.requestedById), requestedBy: String(approval.requestedBy),
      ...(approval.message ? { message: String(approval.message) } : {}),
      ...(approval.feedback ? { feedback: String(approval.feedback) } : {}),
      ...(approval.caption ? { caption: String(approval.caption) } : {}),
      ...(approval.decidedBy ? { decidedBy: String(approval.decidedBy) } : {}),
      ...(approval.decidedAt ? { decidedAt: new Date(String(approval.decidedAt)).toISOString() } : {}),
      ...(approval.requestedAt ? { requestedAt: new Date(String(approval.requestedAt)).toISOString() } : {}),
    } : {}),
    history: history.map((entry) => ({
      id: Number(entry.id),
      status: String(entry.status),
      submittedById: Number(entry.submittedById),
      submittedBy: String(entry.submittedBy),
      submittedAt: new Date(String(entry.submittedAt)).toISOString(),
      ...(entry.message ? { message: String(entry.message) } : {}),
      ...(entry.reviewedById == null ? {} : { reviewedById: Number(entry.reviewedById) }),
      ...(entry.reviewedBy ? { reviewedBy: String(entry.reviewedBy) } : {}),
      ...(entry.reviewedAt ? { reviewedAt: new Date(String(entry.reviewedAt)).toISOString() } : {}),
      ...(entry.feedback ? { feedback: String(entry.feedback) } : {}),
    })),
    ...(teamId ? { teamId, teamName: String(project.teamName) } : {}),
    canSubmit: Boolean(teamId && editRoles.has(role) && ['NONE', 'CHANGES_REQUESTED', 'EXPIRED'].includes(status)),
    canSetupTeam: Boolean(!teamId && role === 'OWNER'),
    canReview: Boolean(pending && (isEditor || isAdmin) && !mine),
    canPublish: Boolean(status === 'APPROVED' && (mine || isEditor)),
    canEdit: Boolean(editRoles.has(role) && !(pending && workflowRole === 'MAKER')),
    reviewers: reviewers.map((reviewer) => String(reviewer.name)),
  }
}

async function publishApprovalRevision(projectId: number) {
  const approved = await one<AnyRow>(
    'SELECT status FROM design_approvals WHERE project_id = ? ORDER BY id DESC LIMIT 1',
    [projectId],
  )
  if (approved?.status === 'APPROVED') publishRoom(projectId, `/topic/project.${projectId}.events`, { type: 'APPROVAL_CHANGED' })
}

app.get('/api/approvals/project/:projectId', async (req, res) => {
  res.json(await approvalView(idOf(req.params.projectId), userOf(req).id))
})

app.get('/api/approvals/waiting', async (req, res) => {
  const userId = userOf(req).id
  const found = await rows<AnyRow>(
    `SELECT a.project_id AS projectId, p.title, maker.name AS requestedBy,
       a.created_at AS requestedAt, p.thumbnail
     FROM design_approvals a JOIN projects p ON p.id = a.project_id
     JOIN users maker ON maker.id = a.requested_by_id
     JOIN teams t ON t.id = p.team_id
     LEFT JOIN team_members m ON m.team_id = t.id AND m.user_id = ?
     WHERE a.status = 'PENDING' AND a.requested_by_id <> ?
       AND (t.owner_id = ? OR m.role = 'EDITOR' OR ? = 1)
     ORDER BY a.created_at DESC`,
    [userId, userId, userId, Number(await isApprovalAdmin(userId))],
  )
  res.json(found.map((item) => ({
    projectId: Number(item.projectId), title: String(item.title), requestedBy: String(item.requestedBy),
    requestedAt: new Date(String(item.requestedAt)).toISOString(), thumbnail: String(item.thumbnail ?? ''),
  })))
})

app.post('/api/approvals/project/:projectId/submit', async (req, res) => {
  const caller = userOf(req)
  const projectId = idOf(req.params.projectId)
  const access = await requireProjectAccess(projectId, caller.id, true)
  const project = await one<AnyRow>(
    'SELECT p.team_id AS teamId, p.title, p.thumbnail, t.name AS teamName FROM projects p LEFT JOIN teams t ON t.id = p.team_id WHERE p.id = ?',
    [projectId],
  )
  if (!project?.teamId) throw Object.assign(new Error('Move this design into a team before sending it for approval.'), { status: 400 })
  const currentApproval = await approvalView(projectId, caller.id)
  if (currentApproval.status === 'APPROVED') {
    throw Object.assign(new Error('This design is already approved. Make a change before requesting another review.'), { status: 409 })
  }
  const workflowRole = await teamWorkflowRole(projectId, caller.id)
  if (!['MAKER', 'EDITOR', 'ADMIN'].includes(String(workflowRole ?? '')) && access !== 'OWNER') {
    throw Object.assign(new Error('Only a Maker, Editor, or team Admin can submit this design for approval.'), { status: 403 })
  }
  const reviewers = await rows<AnyRow>(
    `SELECT u.id, u.name, u.email FROM teams t JOIN users u ON u.id = t.owner_id WHERE t.id = ?
     UNION SELECT u.id, u.name, u.email FROM team_members m JOIN users u ON u.id = m.user_id
     WHERE m.team_id = ? AND m.role = 'EDITOR'`,
    [project.teamId, project.teamId],
  )
  if (!reviewers.length) throw Object.assign(new Error('This team has no Editors who can approve yet.'), { status: 400 })
  const active = await one<AnyRow>('SELECT id FROM design_approvals WHERE project_id = ? AND status = ?', [projectId, 'PENDING'])
  if (active) throw Object.assign(new Error('This design is already waiting for approval.'), { status: 409 })
  const message = String(objectBody(req).message ?? '').trim().slice(0, 2000)
  await run('UPDATE design_approvals SET status = ? WHERE project_id = ? AND status = ?', ['CANCELLED', projectId, 'PENDING'])
  const approvalId = insertId(await run(
    'INSERT INTO design_approvals (project_id, requested_by_id, status, message) VALUES (?, ?, ?, ?)',
    [projectId, caller.id, 'PENDING', message || null],
  ))
  await run('INSERT INTO activities (actor_id, project_id, type, meta) VALUES (?, ?, ?, ?)', [caller.id, projectId, 'approval.requested', project.teamName])
  publishRoom(projectId, `/topic/project.${projectId}.events`, { type: 'APPROVAL_CHANGED' })
  const emails = []
  for (const reviewer of reviewers) {
    if (Number(reviewer.id) === caller.id) continue
    const message = `${caller.name} sent "${project.title}" for your approval`
    await createNotification(Number(reviewer.id), 'APPROVAL', message, `/editor/${projectId}`)
    if (await approvalEmailsEnabled(Number(reviewer.id))) {
      const sent = await sendTransactionalEmail(
        String(reviewer.email), String(reviewer.name), `${caller.name} requested design approval`,
        `${message}\n\nReview this design: ${frontendUrl}/editor/${projectId}`,
        `<p>${htmlEscape(message)}</p>${project.thumbnail ? `<p><img src="${htmlEscape(String(project.thumbnail))}" alt="Preview of ${htmlEscape(String(project.title))}" style="max-width:360px;width:100%;height:auto"></p>` : ''}<p><a href="${htmlEscape(`${frontendUrl}/editor/${projectId}`)}">Review design</a></p>`,
      )
      emails.push(sent)
    }
  }
  const approval = await approvalView(projectId, caller.id)
  res.json({ approval, emails, emailConfigured: Boolean(mailConfiguration().host && mailConfiguration().user) })
})

async function decideApproval(req: Request, approve: boolean, res: ExpressResponse) {
  const caller = userOf(req)
  const approvalId = idOf(req.params.id)
  const body = objectBody(req)
  const approval = await one<AnyRow>(
    `SELECT a.project_id AS projectId, a.status, a.requested_by_id AS requestedById,
       p.team_id AS teamId, p.title, p.revision, maker.name AS makerName, maker.email AS makerEmail
     FROM design_approvals a JOIN projects p ON p.id = a.project_id
     JOIN users maker ON maker.id = a.requested_by_id WHERE a.id = ?`,
    [approvalId],
  )
  if (!approval) throw Object.assign(new Error('Approval request not found.'), { status: 404 })
  const projectId = Number(approval.projectId)
  await requireProjectAccess(projectId, caller.id)
  if (approval.status !== 'PENDING') throw Object.assign(new Error('This request has already been reviewed.'), { status: 409 })
  const editor = Boolean(approval.teamId && await one<AnyRow>(
    'SELECT id FROM teams WHERE id = ? AND owner_id = ? UNION SELECT id FROM team_members WHERE team_id = ? AND user_id = ? AND role = ? LIMIT 1',
    [approval.teamId, caller.id, approval.teamId, caller.id, 'EDITOR'],
  ))
  if (!editor && !(await isApprovalAdmin(caller.id))) {
    throw Object.assign(new Error('Only an Editor of this team or an Admin can review designs.'), { status: 403 })
  }
  if (Number(approval.requestedById) === caller.id) throw Object.assign(new Error('You cannot approve your own request. Ask another Editor.'), { status: 403 })
  const feedback = String(body.feedback ?? '').trim().slice(0, 2000)
  if (!approve && !feedback) throw Object.assign(new Error('Tell the Maker what to change.'), { status: 400 })
  await run(
    `UPDATE design_approvals SET status = ?, decided_by_id = ?, decided_at = CURRENT_TIMESTAMP,
       approved_revision = ?, caption = ?, feedback = ? WHERE id = ?`,
    [approve ? 'APPROVED' : 'CHANGES_REQUESTED', caller.id, approve ? approval.revision : null, approve ? String(body.caption ?? '').trim() || null : null, approve ? null : feedback, approvalId],
  )
  await run('INSERT INTO activities (actor_id, project_id, type, meta) VALUES (?, ?, ?, ?)', [
    caller.id, projectId, approve ? 'approval.approved' : 'approval.changes', approve ? null : feedback,
  ])
  publishRoom(projectId, `/topic/project.${projectId}.events`, { type: 'APPROVAL_CHANGED' })
  const decisionMessage = `${caller.name} ${approve ? 'approved' : 'requested changes to'} "${approval.title}"`
  await createNotification(Number(approval.requestedById), 'APPROVAL', decisionMessage, `/editor/${projectId}`)
  if (await approvalEmailsEnabled(Number(approval.requestedById))) {
    const subject = approve ? 'Your design was approved' : 'Changes were requested on your design'
    const message = approve
      ? `${caller.name} approved "${approval.title}".`
      : `${caller.name} requested changes to "${approval.title}": ${feedback}`
    await sendTransactionalEmail(
      String(approval.makerEmail), String(approval.makerName), subject,
      `${message}\n\nOpen your design: ${frontendUrl}/editor/${projectId}`,
      `<p>${htmlEscape(message)}</p><p><a href="${htmlEscape(`${frontendUrl}/editor/${projectId}`)}">Open design</a></p>`,
    )
  }
  res.json(await approvalView(projectId, caller.id))
}

app.post('/api/approvals/:id/approve', async (req, res) => decideApproval(req, true, res))
app.post('/api/approvals/:id/request-changes', async (req, res) => decideApproval(req, false, res))

async function assertDesignApprovedForPublishing(projectId: number, userId: number) {
  await requireProjectAccess(projectId, userId, true)
  const project = await one<AnyRow>('SELECT team_id AS teamId FROM projects WHERE id = ?', [projectId])
  if (!project) throw Object.assign(new Error('Design not found.'), { status: 404 })
  const workflowRole = await teamWorkflowRole(projectId, userId)
  const isMaker = workflowRole === 'MAKER' || await userHasMakerRole(userId)
  if (project.teamId == null && !isMaker) return
  const approval = project.teamId == null ? null : await approvalView(projectId, userId)
  if (!approval || approval.status !== 'APPROVED') {
    throw Object.assign(new Error('This design needs Editor approval before it can be published.'), { status: 403 })
  }
}

function socialCredentials(platform: string) {
  const prefix = platform === 'instagram' || platform === 'facebook' ? 'FACEBOOK' : platform.toUpperCase()
  const credential = (key: string) => {
    const value = process.env[key]?.trim() ?? ''
    return /^(?:your[_ -]|replace[-_ ]with|example(?:$|[_ -])|<.*>)|changeme/i.test(value) ? '' : value
  }
  return {
    clientId: credential(`${prefix}_CLIENT_ID`),
    clientSecret: credential(`${prefix}_CLIENT_SECRET`),
  }
}

function isSocialPlatform(platform: string): boolean {
  return (socialProviders as readonly string[]).includes(platform)
}

function socialRedirect(platform: string) {
  return `${publicUrl}/api/social/callback/${encodeURIComponent(platform)}`
}

function socialAuthorizeUrl(platform: string, state: string, verifier: string) {
  const { clientId } = socialCredentials(platform)
  const redirectUri = socialRedirect(platform)
  const encode = encodeURIComponent
  const entries: Record<string, string> = {
    facebook: `https://www.facebook.com/v21.0/dialog/oauth?client_id=${encode(clientId)}&redirect_uri=${encode(redirectUri)}&state=${state}&auth_type=reauthenticate&scope=pages_show_list,pages_manage_posts,pages_read_engagement`,
    instagram: `https://www.facebook.com/v21.0/dialog/oauth?client_id=${encode(clientId)}&redirect_uri=${encode(redirectUri)}&state=${state}&auth_type=reauthenticate&scope=instagram_basic,instagram_content_publish,pages_show_list`,
    linkedin: `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${encode(clientId)}&redirect_uri=${encode(redirectUri)}&state=${state}&scope=${encode('openid profile w_member_social')}`,
    x: `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${encode(clientId)}&redirect_uri=${encode(redirectUri)}&state=${state}&scope=${encode('tweet.read tweet.write users.read offline.access')}&code_challenge=${encode(verifier)}&code_challenge_method=plain`,
    pinterest: `https://www.pinterest.com/oauth/?response_type=code&client_id=${encode(clientId)}&redirect_uri=${encode(redirectUri)}&state=${state}&scope=${encode('boards:read,pins:read,pins:write,user_accounts:read')}`,
  }
  return entries[platform]
}

async function socialJson(url: string, init?: RequestInit) {
  let response: globalThis.Response
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) })
  } catch {
    throw new Error('The social platform could not be reached.')
  }
  const text = await response.text()
  let data: Record<string, unknown>
  try {
    data = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error('The social platform returned an unreadable response.')
  }
  if (!response.ok) {
    const error = data.error as Record<string, unknown> | string | undefined
    throw new Error(String(typeof error === 'object' ? error.message ?? error.error_description ?? '' : error ?? '') || `The social platform returned an error (${response.status}).`)
  }
  return data
}

async function exchangeSocialCode(platform: string, code: string, verifier: string): Promise<SocialOAuthAccount> {
  const { clientId, clientSecret } = socialCredentials(platform)
  const redirectUri = socialRedirect(platform)
  const form = new URLSearchParams()
  const tokenUrl = platform === 'facebook' || platform === 'instagram'
    ? 'https://graph.facebook.com/v21.0/oauth/access_token'
    : platform === 'linkedin'
      ? 'https://www.linkedin.com/oauth/v2/accessToken'
      : platform === 'x'
        ? 'https://api.twitter.com/2/oauth2/token'
        : 'https://api.pinterest.com/v5/oauth/token'
  if (platform === 'facebook' || platform === 'instagram') {
    form.set('client_id', clientId); form.set('client_secret', clientSecret); form.set('redirect_uri', redirectUri); form.set('code', code)
  } else if (platform === 'linkedin') {
    form.set('grant_type', 'authorization_code'); form.set('client_id', clientId); form.set('client_secret', clientSecret)
    form.set('redirect_uri', redirectUri); form.set('code', code)
  } else if (platform === 'x') {
    form.set('grant_type', 'authorization_code'); form.set('client_id', clientId); form.set('redirect_uri', redirectUri)
    form.set('code', code); form.set('code_verifier', verifier)
  } else {
    form.set('grant_type', 'authorization_code'); form.set('redirect_uri', redirectUri); form.set('code', code)
  }
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' }
  if (platform === 'x' || platform === 'pinterest') {
    headers.authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
  }
  const token = await socialJson(tokenUrl, { method: 'POST', headers, body: form.toString() })
  const accessToken = String(token.access_token ?? '')
  if (!accessToken) throw new Error('The social platform did not return an access token.')
  let externalId = ''
  let displayName = ''
  if (platform === 'facebook') {
    const login = await socialJson(`https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`)
    const loginId = login.id ? String(login.id) : undefined
    const loginName = login.name ? String(login.name) : undefined
    const pageData = await socialJson(`https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(accessToken)}`)
    const pages = ((pageData.data as Record<string, unknown>[] | undefined) ?? [])
      .filter((page) => page.id && page.access_token)
      .map((page) => ({
        externalId: String(page.id),
        displayName: String(page.name ?? 'Facebook Page'),
        token: String(page.access_token),
        loginId,
        loginName,
      }))
    if (!pages.length) throw new Error('No Facebook Pages were found on this account. Check that you manage a Page and granted pages_show_list access.')
    return { ...pages[0]!, expiresIn: null, refreshToken: null, ...(pages.length > 1 ? { pages } : {}) }
  }
  if (platform === 'instagram') {
    const pages = await socialJson(`https://graph.facebook.com/v21.0/me/accounts?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(accessToken)}`)
    const pageData = pages.data as { instagram_business_account?: { id?: string; username?: string } }[] | undefined
    const account = pageData?.find((page) => page.instagram_business_account?.id)?.instagram_business_account
    if (!account?.id) throw new Error('No Instagram professional account is linked to your Facebook Pages.')
    externalId = account.id; displayName = `@${account.username ?? account.id}`
  } else if (platform === 'linkedin') {
    const profile = await socialJson('https://api.linkedin.com/v2/userinfo', { headers: { authorization: `Bearer ${accessToken}` } })
    externalId = String(profile.sub ?? ''); displayName = String(profile.name ?? '')
  } else if (platform === 'x') {
    const profile = await socialJson('https://api.twitter.com/2/users/me', { headers: { authorization: `Bearer ${accessToken}` } })
    const details = profile.data as Record<string, unknown> | undefined
    externalId = String(details?.id ?? ''); displayName = `@${String(details?.username ?? '')}`
  } else {
    const profile = await socialJson('https://api.pinterest.com/v5/user_account', { headers: { authorization: `Bearer ${accessToken}` } })
    const boards = await socialJson('https://api.pinterest.com/v5/boards?page_size=1', { headers: { authorization: `Bearer ${accessToken}` } })
    const board = (boards.items as Record<string, unknown>[] | undefined)?.[0]
    if (!board?.id) throw new Error('Create a Pinterest board first, then connect again.')
    externalId = String(board.id); displayName = String(profile.username ?? '')
  }
  return {
    token: accessToken,
    externalId,
    displayName,
    expiresIn: Number(token.expires_in ?? 0) || null,
    refreshToken: token.refresh_token == null ? null : String(token.refresh_token),
  }
}

async function saveFacebookPage(executor: Pick<PoolConnection, 'execute'>, userId: number, page: FacebookPageAccount) {
  const [existing] = await executor.execute<RowDataPacket[]>(
    `SELECT id FROM social_accounts WHERE user_id = ? AND platform = 'facebook' AND external_id = ? LIMIT 1 FOR UPDATE`,
    [userId, page.externalId],
  )
  const details = [page.displayName, encryptSecret(page.token), page.loginId ?? null, page.loginName ?? null]
  if (existing[0]) {
    await executor.execute(
      `UPDATE social_accounts SET display_name = ?, encrypted_access_token = ?, encrypted_refresh_token = NULL,
         token_expires_at = NULL, facebook_login_id = ?, facebook_login_name = ? WHERE id = ?`,
      sqlValues([...details, existing[0].id]),
    )
    return Number(existing[0].id)
  }
  const [result] = await executor.execute<ResultSetHeader>(
    `INSERT INTO social_accounts (created_at, user_id, platform, external_id, display_name, encrypted_access_token, encrypted_refresh_token, token_expires_at, facebook_login_id, facebook_login_name)
     VALUES (CURRENT_TIMESTAMP, ?, 'facebook', ?, ?, ?, NULL, NULL, ?, ?)`,
    sqlValues([userId, page.externalId, ...details]),
  )
  return Number(result.insertId)
}

/** Verifies and decodes a Facebook "signed_request" (base64url(HMAC-SHA256 signature) + '.' +
 * base64url(JSON payload)), per https://developers.facebook.com/docs/reference/login/signed-request/.
 * Returns null if the format or signature doesn't check out, so the caller can reject the request. */
function parseFacebookSignedRequest(signedRequest: string, appSecret: string): { user_id?: string } | null {
  const parts = signedRequest.split('.')
  if (parts.length !== 2) return null
  const [encodedSig, encodedPayload] = parts as [string, string]
  const toBuffer = (b64url: string) => Buffer.from(b64url.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  const expectedSig = createHmac('sha256', appSecret).update(encodedPayload).digest()
  const actualSig = toBuffer(encodedSig)
  if (actualSig.length !== expectedSig.length || !timingSafeEqual(actualSig, expectedSig)) return null
  try {
    return JSON.parse(toBuffer(encodedPayload).toString('utf8'))
  } catch {
    return null
  }
}

// Facebook's "Data Deletion Callback URL" (Settings > Basic > User data deletion, or the equivalent App
// Review field) — Facebook POSTs here automatically whenever a user removes this app from their Facebook
// settings, and expects back { url, confirmation_code } pointing at a page the user can check for status.
// This is required before Facebook will let any non-admin/tester account log in through the app.
app.post('/api/social/data-deletion/facebook', async (req, res) => {
  const { clientSecret } = socialCredentials('facebook')
  const signedRequest = String(req.body?.signed_request ?? '')
  const payload = clientSecret ? parseFacebookSignedRequest(signedRequest, clientSecret) : null
  if (!payload?.user_id) {
    res.status(400).json({ error: 'Invalid signed_request.' })
    return
  }
  await run(`DELETE FROM social_accounts WHERE platform = 'facebook' AND facebook_login_id = ?`, [payload.user_id])
  const confirmationCode = randomBytes(8).toString('hex')
  res.json({
    url: `${publicUrl}/api/social/data-deletion/status?code=${confirmationCode}`,
    confirmation_code: confirmationCode,
  })
})

// The status page Facebook's response above points users at. Deletion already happened synchronously in
// the POST handler, so this is purely informational — it isn't a lookup against stored confirmation codes.
app.get('/api/social/data-deletion/status', (req, res) => {
  const code = String(req.query.code ?? '')
  res.type('html').send(
    `<!doctype html><html><head><meta charset="utf-8"><title>Data deletion status</title></head>` +
      `<body style="font-family:sans-serif;max-width:480px;margin:48px auto;line-height:1.5">` +
      `<h1>Data deletion complete</h1>` +
      `<p>Your DesignHub data connected via Facebook/Instagram Login has been deleted.</p>` +
      (code ? `<p>Confirmation code: <code>${code.replace(/[^a-f0-9]/gi, '')}</code></p>` : '') +
      `</body></html>`,
  )
})

app.get('/api/social/callback/:platform', async (req, res) => {
  const platform = String(req.params.platform)
  const base = new URL('/social', frontendUrl)
  if (req.query.error || typeof req.query.code !== 'string' || typeof req.query.state !== 'string') {
    base.searchParams.set('error', String(req.query.error ?? 'cancelled'))
    res.redirect(base.toString())
    return
  }
  const state = await one<AnyRow>('SELECT user_id AS userId, platform, verifier FROM oauth_states WHERE state = ? AND expires_at > CURRENT_TIMESTAMP', [String(req.query.state)])
  await run('DELETE FROM oauth_states WHERE state = ?', [String(req.query.state)])
  if (!state || state.platform !== platform || !isSocialPlatform(platform)) {
    base.searchParams.set('error', 'expired')
    res.redirect(base.toString())
    return
  }
  try {
    const account = await exchangeSocialCode(platform, String(req.query.code), String(state.verifier))
    if (platform === 'facebook' && account.pages && account.pages.length > 1) {
      const ticket = randomBytes(32).toString('base64url')
      await run('DELETE FROM oauth_pending_accounts WHERE expires_at <= CURRENT_TIMESTAMP')
      // 30 minutes, not 10: by this point the user already finished Facebook's own multi-screen consent
      // (login, permissions, any Business Verification interstitial) and this window is only for them to
      // view and submit the Page picker in our UI — a short window here caused real users to land back
      // with a ticket that read as already "expired" if that upstream Facebook flow took a few minutes.
      await run(
        `INSERT INTO oauth_pending_accounts (ticket, user_id, platform, page_data, expires_at)
         VALUES (?, ?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 MINUTE))`,
        [ticket, state.userId, platform, encryptSecret(JSON.stringify(account.pages))],
      )
      base.searchParams.set('ticket', ticket)
      res.redirect(base.toString())
      return
    }
    if (platform === 'facebook') {
      await saveFacebookPage(db(), Number(state.userId), account as FacebookPageAccount)
    } else {
      const expiresAt = account.expiresIn ? new Date(Date.now() + account.expiresIn * 1000) : null
      await run(
        `INSERT INTO social_accounts (created_at, user_id, platform, external_id, display_name, encrypted_access_token, encrypted_refresh_token, token_expires_at)
         VALUES (CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?)`,
        [state.userId, platform, account.externalId, account.displayName, encryptSecret(account.token),
          account.refreshToken ? encryptSecret(account.refreshToken) : null, expiresAt],
      )
    }
    base.searchParams.set('connected', platform)
  } catch (error) {
    base.searchParams.set('error', (error as Error).message.slice(0, 160))
  }
  res.redirect(base.toString())
})

app.get('/api/social/platforms', (_req, res) => {
  res.json([...socialProviders].sort().map((platform) => ({
    platform, configured: Boolean(socialCredentials(platform).clientId && socialCredentials(platform).clientSecret),
  })))
})

app.get('/api/social/accounts', async (req, res) => {
  const found = await rows<AnyRow>(
    `SELECT id, platform, display_name AS displayName, created_at AS connectedAt, token_expires_at AS tokenExpiresAt,
      facebook_login_name AS loginName
     FROM social_accounts WHERE user_id = ? ORDER BY created_at DESC`,
    [userOf(req).id],
  )
  res.json(found.map((account) => ({
    id: Number(account.id), platform: String(account.platform), displayName: String(account.displayName ?? ''),
    connectedAt: new Date(String(account.connectedAt)).toISOString(),
    expired: account.tokenExpiresAt != null && new Date(String(account.tokenExpiresAt)).getTime() < Date.now(),
    loginName: account.loginName ? String(account.loginName) : null,
  })))
})

app.post('/api/social/accounts/connect/:platform', async (req, res) => {
  const platform = String(req.params.platform)
  if (!isSocialPlatform(platform)) throw Object.assign(new Error('Platform not found.'), { status: 404 })
  const credentials = socialCredentials(platform)
  if (!credentials.clientId || !credentials.clientSecret) {
    throw Object.assign(new Error(`Publishing to ${platform} is not set up on this server yet. An administrator needs to add the ${platform} app credentials.`), { status: 400 })
  }
  const state = randomBytes(24).toString('base64url')
  const verifier = randomBytes(32).toString('base64url')
  await run(
    'INSERT INTO oauth_states (state, user_id, platform, verifier, expires_at) VALUES (?, ?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 10 MINUTE))',
    [state, userOf(req).id, platform, verifier],
  )
  res.json({ url: socialAuthorizeUrl(platform, state, verifier) })
})

app.get('/api/social/accounts/pending/:ticket', async (req, res) => {
  const ticket = String(req.params.ticket)
  if (!/^[A-Za-z0-9_-]{40,80}$/.test(ticket)) throw Object.assign(new Error('Invalid Facebook Page selection.'), { status: 400 })
  const pending = await one<AnyRow>(
    `SELECT page_data AS pageData FROM oauth_pending_accounts
     WHERE ticket = ? AND user_id = ? AND platform = 'facebook' AND expires_at > CURRENT_TIMESTAMP`,
    [ticket, userOf(req).id],
  )
  if (!pending) throw Object.assign(new Error('The Facebook Page selection expired. Connect Facebook again.'), { status: 410 })
  const pages = JSON.parse(decryptSecret(String(pending.pageData))) as FacebookPageAccount[]
  res.setHeader('Cache-Control', 'no-store')
  res.json(pages.map(({ externalId, displayName, loginName }) => ({ id: externalId, name: displayName, loginName: loginName ?? null })))
})

app.post('/api/social/accounts/pending/:ticket/select', async (req, res) => {
  const ticket = String(req.params.ticket)
  if (!/^[A-Za-z0-9_-]{40,80}$/.test(ticket)) throw Object.assign(new Error('Invalid Facebook Page selection.'), { status: 400 })
  const body = objectBody(req)
  // pageIds selects several Pages in one request; pageId is the original single-Page form and is still accepted.
  const requested = Array.isArray(body.pageIds) ? body.pageIds.map(String) : [String(body.pageId ?? '')]
  const pageIds = [...new Set(requested.filter(Boolean))]
  if (!pageIds.length || pageIds.some((pageId) => pageId.length > 200)) throw Object.assign(new Error('Choose a Facebook Page.'), { status: 400 })
  const caller = userOf(req)
  const connection = await db().getConnection()
  try {
    await connection.beginTransaction()
    const [found] = await connection.execute<RowDataPacket[]>(
      `SELECT page_data AS pageData FROM oauth_pending_accounts
       WHERE ticket = ? AND user_id = ? AND platform = 'facebook' AND expires_at > CURRENT_TIMESTAMP
       FOR UPDATE`,
      [ticket, caller.id],
    )
    const pending = found[0] as AnyRow | undefined
    if (!pending) throw Object.assign(new Error('The Facebook Page selection expired. Connect Facebook again.'), { status: 410 })
    const pages = JSON.parse(decryptSecret(String(pending.pageData))) as FacebookPageAccount[]
    const selected = pageIds.map((pageId) => {
      const page = pages.find((candidate) => candidate.externalId === pageId)
      if (!page) throw Object.assign(new Error('That Facebook Page was not part of this connection. Try connecting again.'), { status: 400 })
      return page
    })
    const ids: number[] = []
    for (const page of selected) ids.push(await saveFacebookPage(connection, caller.id, page))
    await connection.execute('DELETE FROM oauth_pending_accounts WHERE ticket = ?', [ticket])
    await connection.commit()
    const accounts = selected.map((page, index) => ({
      id: ids[index],
      platform: 'facebook',
      displayName: page.displayName,
      connectedAt: new Date().toISOString(),
      expired: false,
      loginName: page.loginName ?? null,
    }))
    if (Array.isArray(body.pageIds)) res.status(201).json(accounts)
    else res.status(201).json(accounts[0])
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
})

app.delete('/api/social/accounts/:id', async (req, res) => {
  const accountId = idOf(req.params.id)
  const caller = userOf(req)
  const count = await one<AnyRow>('SELECT COUNT(*) AS count FROM social_posts WHERE account_id = ?', [accountId])
  if (Number(count?.count ?? 0) > 0) throw Object.assign(new Error('This account still has posts. Delete them before disconnecting.'), { status: 409 })
  await run('DELETE FROM social_accounts WHERE id = ? AND user_id = ?', [accountId, caller.id])
  res.status(204).end()
})

async function socialPostDto(postId: number) {
  const post = await one<AnyRow>(
    `SELECT p.id, p.account_id AS accountId, a.platform, a.display_name AS accountName, p.project_id AS projectId,
      p.caption, p.media_url AS mediaUrl, p.status, p.scheduled_at AS scheduledAt, p.published_at AS publishedAt,
      p.feedback, p.error, p.author_id AS authorId, author.name AS authorName, p.reviewer_id AS reviewerId,
      reviewer.name AS reviewerName, p.created_at AS createdAt
     FROM social_posts p JOIN social_accounts a ON a.id = p.account_id
     JOIN users author ON author.id = p.author_id LEFT JOIN users reviewer ON reviewer.id = p.reviewer_id
     WHERE p.id = ?`,
    [postId],
  )
  if (!post) throw Object.assign(new Error('Post not found.'), { status: 404 })
  return {
    id: Number(post.id), accountId: Number(post.accountId), platform: String(post.platform), accountName: String(post.accountName),
    ...(post.projectId == null ? {} : { projectId: Number(post.projectId) }),
    ...(post.caption ? { caption: String(post.caption) } : {}),
    ...(post.mediaUrl ? { mediaUrl: String(post.mediaUrl) } : {}),
    status: String(post.status),
    ...(post.scheduledAt ? { scheduledAt: new Date(String(post.scheduledAt)).toISOString() } : {}),
    ...(post.publishedAt ? { publishedAt: new Date(String(post.publishedAt)).toISOString() } : {}),
    ...(post.feedback ? { feedback: String(post.feedback) } : {}),
    ...(post.error ? { error: String(post.error) } : {}),
    authorId: Number(post.authorId), authorName: String(post.authorName),
    ...(post.reviewerId == null ? {} : { reviewerId: Number(post.reviewerId), reviewerName: String(post.reviewerName) }),
    createdAt: new Date(String(post.createdAt)).toISOString(),
  }
}

app.get('/api/social/posts', async (req, res) => {
  const caller = userOf(req)
  const found = await rows<AnyRow>(
    'SELECT id FROM social_posts WHERE author_id = ? OR reviewer_id = ? ORDER BY created_at DESC',
    [caller.id, caller.id],
  )
  res.json(await Promise.all(found.map((post) => socialPostDto(Number(post.id)))))
})

app.post('/api/social/posts', async (req, res) => {
  const caller = userOf(req)
  const body = objectBody(req)
  const accountId = Number(body.accountId)
  const account = await one<AnyRow>('SELECT id FROM social_accounts WHERE id = ? AND user_id = ?', [accountId, caller.id])
  if (!account) throw Object.assign(new Error('Social account not found.'), { status: 404 })
  const projectId = body.projectId == null ? null : Number(body.projectId)
  if (projectId != null) {
    const role = await requireProjectAccess(projectId, caller.id)
    if (!editRoles.has(role)) throw Object.assign(new Error('You do not have permission to publish from this design.'), { status: 403 })
  }
  const reviewerId = body.reviewerId == null ? null : Number(body.reviewerId)
  if (reviewerId === caller.id) throw Object.assign(new Error('Choose someone else to review this post.'), { status: 400 })
  const id = insertId(await run(
    `INSERT INTO social_posts (created_at, author_id, account_id, project_id, reviewer_id, caption, media_url, scheduled_at, status)
     VALUES (CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, 'DRAFT')`,
    [caller.id, accountId, projectId, reviewerId, body.caption ?? null, body.mediaUrl ?? null, body.scheduledAt ?? null],
  ))
  if (projectId) await run('INSERT INTO activities (created_at, actor_id, project_id, type, meta) VALUES (CURRENT_TIMESTAMP, ?, ?, ?, ?)', [caller.id, projectId, 'social.post.created', null])
  res.status(201).json(await socialPostDto(id))
})

app.post('/api/social/posts/:id/submit', async (req, res) => {
  const caller = userOf(req)
  const id = idOf(req.params.id)
  const post = await one<AnyRow>('SELECT status, author_id AS authorId, reviewer_id AS reviewerId, account_id AS accountId, project_id AS projectId FROM social_posts WHERE id = ?', [id])
  if (!post) throw Object.assign(new Error('Post not found.'), { status: 404 })
  if (Number(post.authorId) !== caller.id) throw Object.assign(new Error('Only the author can change this post.'), { status: 403 })
  if (!['DRAFT', 'REJECTED'].includes(String(post.status))) throw Object.assign(new Error('This post cannot be submitted in its current state.'), { status: 409 })
  if (!post.reviewerId) throw Object.assign(new Error('Choose a reviewer before submitting for approval.'), { status: 400 })
  await run('UPDATE social_posts SET status = ?, feedback = NULL WHERE id = ?', ['PENDING_APPROVAL', id])
  const account = await one<AnyRow>('SELECT platform FROM social_accounts WHERE id = ?', [post.accountId])
  await createNotification(
    Number(post.reviewerId), 'APPROVAL', `${caller.name} asked you to review a ${account?.platform ?? 'social'} post`, '/social',
  )
  res.json(await socialPostDto(id))
})

app.post('/api/social/posts/:id/review', async (req, res) => {
  const caller = userOf(req)
  const id = idOf(req.params.id)
  const body = objectBody(req)
  const post = await one<AnyRow>(
    'SELECT status, author_id AS authorId, reviewer_id AS reviewerId, account_id AS accountId FROM social_posts WHERE id = ?',
    [id],
  )
  if (!post) throw Object.assign(new Error('Post not found.'), { status: 404 })
  if (Number(post.reviewerId) !== caller.id) throw Object.assign(new Error('Only the assigned reviewer can review this post.'), { status: 403 })
  if (post.status !== 'PENDING_APPROVAL') throw Object.assign(new Error('This post is not waiting for review.'), { status: 409 })
  const approve = Boolean(body.approve)
  const feedback = String(body.feedback ?? '').trim()
  if (!approve && !feedback) throw Object.assign(new Error('Tell the author what to change.'), { status: 400 })
  await run('UPDATE social_posts SET status = ?, feedback = ? WHERE id = ?', [approve ? 'APPROVED' : 'REJECTED', feedback || null, id])
  const account = await one<AnyRow>('SELECT platform FROM social_accounts WHERE id = ?', [post.accountId])
  await createNotification(
    Number(post.authorId), 'APPROVAL', `${caller.name} ${approve ? 'approved' : 'requested changes to'} your ${account?.platform ?? 'social'} post`, '/social',
  )
  res.json(await socialPostDto(id))
})

async function publishSocialPost(id: number, scheduledAt?: string) {
  const post = await one<AnyRow>(
    `SELECT p.*, a.platform, a.external_id AS externalId, a.encrypted_access_token AS encryptedAccessToken,
      a.token_expires_at AS tokenExpiresAt FROM social_posts p JOIN social_accounts a ON a.id = p.account_id WHERE p.id = ?`,
    [id],
  )
  if (!post) throw Object.assign(new Error('Post not found.'), { status: 404 })
  const currentStatus = String(post.status)
  if (!['DRAFT', 'APPROVED', 'SCHEDULED', 'FAILED'].includes(currentStatus)) {
    throw Object.assign(new Error(`This post is ${currentStatus.toLowerCase().replaceAll('_', ' ')} and cannot be published.`), { status: 409 })
  }
  if (post.reviewer_id && !['APPROVED', 'SCHEDULED', 'FAILED'].includes(currentStatus)) {
    throw Object.assign(new Error('This post needs approval before it can be published.'), { status: 409 })
  }
  const authorHasMakerRole = await userHasMakerRole(Number(post.author_id))
  if (authorHasMakerRole && !post.project_id) {
    throw Object.assign(new Error('Maker posts must be linked to an approved DesignHub design before publishing.'), { status: 403 })
  }
  if (post.project_id) {
    await assertDesignApprovedForPublishing(Number(post.project_id), Number(post.author_id))
  }
  if (scheduledAt && new Date(scheduledAt).getTime() > Date.now() + 30_000) {
    await run('UPDATE social_posts SET scheduled_at = ?, status = ? WHERE id = ?', [new Date(scheduledAt), 'SCHEDULED', id])
    return socialPostDto(id)
  }
  if (post.tokenExpiresAt && new Date(String(post.tokenExpiresAt)).getTime() < Date.now()) {
    throw Object.assign(new Error(`The connection to ${post.platform} has expired. Reconnect the account.`), { status: 400 })
  }
  const token = decryptSecret(String(post.encryptedAccessToken))
  const platform = String(post.platform)
  const externalId = String(post.externalId ?? '')
  const caption = String(post.caption ?? '')
  const mediaUrl = String(post.media_url ?? '')
  await run('UPDATE social_posts SET status = ? WHERE id = ?', ['PUBLISHING', id])
  let externalPostId = ''
  try {
    if (platform === 'facebook') {
      const form = new URLSearchParams({ access_token: token })
      const target = mediaUrl ? `${externalId}/photos` : `${externalId}/feed`
      form.set(mediaUrl ? 'url' : 'message', mediaUrl || caption)
      if (mediaUrl) form.set('caption', caption)
      const data = await socialJson(`https://graph.facebook.com/v21.0/${target}`, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString(),
      })
      externalPostId = String(data.id ?? '')
    } else if (platform === 'instagram') {
      if (!mediaUrl) throw new Error('Instagram posts need an image. Export your design first.')
      const form = new URLSearchParams({ image_url: mediaUrl, caption, access_token: token })
      const container = await socialJson(`https://graph.facebook.com/v21.0/${externalId}/media`, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString(),
      })
      const published = await socialJson(`https://graph.facebook.com/v21.0/${externalId}/media_publish`, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ creation_id: String(container.id), access_token: token }).toString(),
      })
      externalPostId = String(published.id ?? '')
    } else if (platform === 'linkedin') {
      const text = mediaUrl ? `${caption}\n${mediaUrl}` : caption
      const data = await socialJson('https://api.linkedin.com/v2/ugcPosts', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0' },
        body: JSON.stringify({
          author: `urn:li:person:${externalId}`, lifecycleState: 'PUBLISHED',
          specificContent: { 'com.linkedin.ugc.ShareContent': { shareCommentary: { text }, shareMediaCategory: 'NONE' } },
          visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
        }),
      })
      externalPostId = String(data.id ?? '')
    } else if (platform === 'x') {
      const text = mediaUrl ? `${caption} ${mediaUrl}` : caption
      if (text.length > 280) throw new Error(`Posts on X are limited to 280 characters. Yours is ${text.length}.`)
      const data = await socialJson('https://api.twitter.com/2/tweets', {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ text }),
      })
      externalPostId = String((data.data as Record<string, unknown> | undefined)?.id ?? '')
    } else if (platform === 'pinterest') {
      if (!mediaUrl) throw new Error('Pins need an image. Export your design first.')
      const data = await socialJson('https://api.pinterest.com/v5/pins', {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          board_id: externalId, description: caption, title: caption.slice(0, 100),
          media_source: { source_type: 'image_url', url: mediaUrl },
        }),
      })
      externalPostId = String(data.id ?? '')
    }
    if (!externalPostId) throw new Error('The social platform did not confirm the published post.')
    await run('UPDATE social_posts SET status = ?, external_post_id = ?, published_at = CURRENT_TIMESTAMP, error = NULL WHERE id = ?', ['PUBLISHED', externalPostId, id])
    await createNotification(Number(post.author_id), 'PUBLISHING', `Your ${platform} post is live`, '/social')
  } catch (error) {
    const message = (error as Error).message || 'The post could not be published.'
    await run('UPDATE social_posts SET status = ?, error = ? WHERE id = ?', ['FAILED', message.slice(0, 2000), id])
    await createNotification(Number(post.author_id), 'PUBLISHING', `Your ${platform} post could not be published`, '/social')
  }
  return socialPostDto(id)
}

app.post('/api/social/posts/:id/publish', async (req, res) => {
  const id = idOf(req.params.id)
  const caller = userOf(req)
  const post = await one<AnyRow>('SELECT author_id AS authorId FROM social_posts WHERE id = ?', [id])
  if (!post) throw Object.assign(new Error('Post not found.'), { status: 404 })
  if (Number(post.authorId) !== caller.id) throw Object.assign(new Error('Only the author can change this post.'), { status: 403 })
  const at = objectBody(req).at
  res.json(await publishSocialPost(id, typeof at === 'string' ? at : undefined))
})

app.delete('/api/social/posts/:id', async (req, res) => {
  const id = idOf(req.params.id)
  const caller = userOf(req)
  const post = await one<AnyRow>('SELECT author_id AS authorId, status FROM social_posts WHERE id = ?', [id])
  if (!post) throw Object.assign(new Error('Post not found.'), { status: 404 })
  if (Number(post.authorId) !== caller.id) throw Object.assign(new Error('Only the author can change this post.'), { status: 403 })
  if (['PUBLISHING', 'PUBLISHED'].includes(String(post.status))) throw Object.assign(new Error('This post can no longer be deleted.'), { status: 409 })
  await run('DELETE FROM social_posts WHERE id = ?', [id])
  res.status(204).end()
})

const socialProviders = ['facebook', 'instagram', 'linkedin', 'pinterest', 'x'] as const

app.get('/api/notifications', async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 30) || 30))
  const found = await rows<AnyRow>(
    'SELECT id, type, message, link, created_at AS createdAt, read_at AS readAt FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [userOf(req).id, limit],
  )
  res.json(found.map((item) => ({
    id: Number(item.id), type: String(item.type), message: String(item.message),
    ...(item.link ? { link: String(item.link) } : {}),
    createdAt: new Date(String(item.createdAt)).toISOString(), read: Boolean(item.readAt),
  })))
})

app.get('/api/notifications/unread-count', async (req, res) => {
  const count = await one<AnyRow>('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL', [userOf(req).id])
  res.json({ count: Number(count?.count ?? 0) })
})

app.post('/api/notifications/:id/read', async (req, res) => {
  await run('UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?', [idOf(req.params.id), userOf(req).id])
  res.status(204).end()
})

app.post('/api/notifications/read-all', async (req, res) => {
  await run('UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL', [userOf(req).id])
  res.status(204).end()
})

app.get('/api/activity', async (req, res) => {
  const caller = userOf(req)
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 40) || 40))
  const projectId = req.query.projectId == null ? null : Number(req.query.projectId)
  if (projectId !== null) await requireProjectAccess(projectId, caller.id)
  const found = projectId
    ? await rows<AnyRow>(
        `SELECT a.id, a.type, a.meta, a.created_at AS createdAt, a.project_id AS projectId,
          p.title AS projectTitle, u.id AS actorId, u.name AS actorName
         FROM activities a LEFT JOIN users u ON u.id = a.actor_id LEFT JOIN projects p ON p.id = a.project_id
         WHERE a.project_id = ? ORDER BY a.created_at DESC LIMIT ?`,
        [projectId, limit],
      )
    : await rows<AnyRow>(
        `SELECT a.id, a.type, a.meta, a.created_at AS createdAt, a.project_id AS projectId,
          p.title AS projectTitle, u.id AS actorId, u.name AS actorName
         FROM activities a LEFT JOIN users u ON u.id = a.actor_id LEFT JOIN projects p ON p.id = a.project_id
         WHERE a.actor_id = ? ORDER BY a.created_at DESC LIMIT ?`,
        [caller.id, limit],
      )
  res.json(found.map((activity) => ({
    id: Number(activity.id), type: String(activity.type), ...(activity.meta ? { meta: String(activity.meta) } : {}),
    createdAt: new Date(String(activity.createdAt)).toISOString(),
    ...(activity.projectId == null ? {} : { projectId: Number(activity.projectId), projectTitle: String(activity.projectTitle ?? '') }),
    ...(activity.actorId == null ? {} : { actorId: Number(activity.actorId), actorName: String(activity.actorName) }),
  })))
})

app.get('/api/product-updates', async (_req, res) => {
  const found = await rows<AnyRow>('SELECT id, title, body, created_at AS createdAt FROM product_updates ORDER BY created_at DESC LIMIT 20')
  res.json(found.map((item) => ({ id: Number(item.id), title: String(item.title), body: String(item.body), createdAt: new Date(String(item.createdAt)).toISOString() })))
})

app.get('/api/subscription/plans', async (_req, res) => {
  const found = await rows<AnyRow>(
    `SELECT code, name, price_cents AS priceCents, max_projects AS maxProjects, storage_bytes AS storageBytes,
       ai_requests_per_month AS aiRequestsPerMonth, exports_per_month AS exportsPerMonth, team_seats AS teamSeats
     FROM plans ORDER BY price_cents`,
  )
  res.json(found.map((plan) => ({
    code: String(plan.code), name: String(plan.name), priceCents: Number(plan.priceCents),
    maxProjects: Number(plan.maxProjects), storageBytes: Number(plan.storageBytes),
    aiRequestsPerMonth: Number(plan.aiRequestsPerMonth), exportsPerMonth: Number(plan.exportsPerMonth),
    teamSeats: Number(plan.teamSeats),
  })))
})

async function usageOf(userId: number) {
  const subscription = await one<AnyRow>(
    `SELECT s.status, s.current_period_end AS currentPeriodEnd, p.code AS planCode, p.name AS planName,
      p.price_cents AS priceCents,
      p.max_projects AS maxProjects, p.storage_bytes AS storageBytes, p.ai_requests_per_month AS aiRequestsPerMonth,
      p.exports_per_month AS exportsPerMonth, p.team_seats AS teamSeats
     FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.user_id = ? ORDER BY s.created_at DESC LIMIT 1`,
    [userId],
  )
  const plan: AnyRow = subscription ?? {
    planCode: 'free', planName: 'Free', status: 'ACTIVE', maxProjects: 3, storageBytes: 524288000,
    aiRequestsPerMonth: 20, exportsPerMonth: 20, teamSeats: 1,
  } as AnyRow
  const projects = await one<AnyRow>('SELECT COUNT(*) AS count FROM projects WHERE owner_id = ? AND deleted_at IS NULL', [userId])
  const storage = await one<AnyRow>('SELECT COALESCE(SUM(size_bytes), 0) AS bytes FROM assets WHERE owner_id = ?', [userId])
  const aiCount = await one<AnyRow>('SELECT COUNT(*) AS count FROM ai_usage WHERE user_id = ? AND created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 DAY)', [userId])
  const exportCount = await one<AnyRow>('SELECT COUNT(*) AS count FROM exports WHERE user_id = ? AND created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 30 DAY)', [userId])
  return {
    plan: {
      code: String(plan.planCode), name: String(plan.planName), priceCents: Number(plan.priceCents ?? 0),
      maxProjects: Number(plan.maxProjects), storageBytes: Number(plan.storageBytes),
      aiRequestsPerMonth: Number(plan.aiRequestsPerMonth), exportsPerMonth: Number(plan.exportsPerMonth),
      teamSeats: Number(plan.teamSeats),
    },
    status: String(plan.status),
    ...(plan.currentPeriodEnd == null ? {} : { currentPeriodEnd: new Date(String(plan.currentPeriodEnd)).toISOString() }),
    projects: Number(projects?.count ?? 0), storageBytes: Number(storage?.bytes ?? 0),
    aiRequests: Number(aiCount?.count ?? 0), exports: Number(exportCount?.count ?? 0),
  }
}

app.get('/api/subscription', async (req, res) => res.json(await usageOf(userOf(req).id)))
app.get('/api/subscription/billing', async (req, res) => {
  const found = await rows<AnyRow>(
    'SELECT id, description, amount_cents AS amountCents, status, created_at AS createdAt FROM billing_records WHERE user_id = ? ORDER BY created_at DESC',
    [userOf(req).id],
  )
  res.json(found.map((record) => ({ ...record, id: Number(record.id), amountCents: Number(record.amountCents), createdAt: new Date(String(record.createdAt)).toISOString() })))
})

app.post('/api/subscription/change', async (req, res) => {
  const caller = userOf(req)
  const planCode = String(objectBody(req).planCode ?? '')
  const plan = await one<AnyRow>('SELECT id, name, price_cents AS priceCents FROM plans WHERE code = ?', [planCode])
  if (!plan) throw Object.assign(new Error('Plan not found.'), { status: 404 })
  await run(
    `INSERT INTO subscriptions (user_id, plan_id, status, current_period_end)
     VALUES (?, ?, 'ACTIVE', DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 DAY))`,
    [caller.id, plan.id],
  )
  if (Number(plan.priceCents) > 0) {
    await run('INSERT INTO billing_records (user_id, description, amount_cents, status) VALUES (?, ?, ?, ?)', [
      caller.id, `${plan.name} plan, 30 days`, plan.priceCents, 'PAID',
    ])
  }
  res.json(await usageOf(caller.id))
})

app.get('/api/categories', async (_req, res) => {
  const found = await rows<AnyRow>('SELECT id, name, slug, width, height FROM categories ORDER BY sort_order, name')
  res.json(found.map((row) => ({ id: Number(row.id), name: String(row.name), slug: String(row.slug), width: Number(row.width), height: Number(row.height) })))
})

/** Pixabay search mapped to the response shape the editor's stock panel already reads. The key stays on the server. */
async function pixabaySearch(key: string, query: string, page: number, category: string) {
  const params = new URLSearchParams({
    key,
    q: query,
    page: String(page),
    per_page: '24',
    safesearch: 'true',
    image_type: category === 'illustration' || category === 'vector' ? category : 'photo',
    min_width: '1000',
    order: 'popular',
  })
  let response: globalThis.Response
  try {
    response = await fetch(`https://pixabay.com/api/?${params}`, { signal: AbortSignal.timeout(15_000) })
  } catch {
    throw Object.assign(new Error('The stock photo service could not be reached. Please try again.'), { status: 502 })
  }
  if (!response.ok) {
    throw Object.assign(new Error(`The stock photo service returned an error (${response.status}).`), { status: response.status === 429 ? 503 : 502 })
  }
  const data = await response.json() as { totalHits?: number; hits?: Record<string, unknown>[] }
  return {
    page_count: Math.ceil(Math.min(Number(data.totalHits ?? 0), 500) / 24),
    results: (data.hits ?? []).map((hit) => ({
      id: String(hit.id),
      title: String(hit.tags ?? 'Photo').split(',')[0]?.trim() || 'Photo',
      url: String(hit.largeImageURL),
      thumbnail: String(hit.webformatURL),
      width: Number(hit.imageWidth),
      height: Number(hit.imageHeight),
      creator: String(hit.user ?? ''),
      foreign_landing_url: String(hit.pageURL ?? ''),
    })),
  }
}

/** Giphy GIF search mapped to the stock panel's response shape. The key stays on the server. */
async function giphySearch(key: string, query: string, page: number) {
  const params = new URLSearchParams({
    api_key: key,
    q: query,
    limit: '24',
    offset: String((page - 1) * 24),
    rating: 'g',
    lang: 'en',
  })
  let response: globalThis.Response
  try {
    response = await fetch(`https://api.giphy.com/v1/gifs/search?${params}`, { signal: AbortSignal.timeout(15_000) })
  } catch {
    throw Object.assign(new Error('The GIF service could not be reached. Please try again.'), { status: 502 })
  }
  if (!response.ok) {
    throw Object.assign(new Error(`The GIF service returned an error (${response.status}).`), { status: response.status === 429 ? 503 : 502 })
  }
  const data = await response.json() as { data?: Record<string, any>[]; pagination?: { total_count?: number } }
  return {
    page_count: Math.ceil(Math.min(Number(data.pagination?.total_count ?? 0), 4000) / 24),
    results: (data.data ?? []).map((gif) => ({
      id: String(gif.id),
      title: String(gif.title || 'GIF'),
      url: String(gif.images?.original?.url ?? ''),
      thumbnail: String(gif.images?.fixed_width?.url ?? gif.images?.original?.url ?? ''),
      width: Number(gif.images?.original?.width ?? 480),
      height: Number(gif.images?.original?.height ?? 270),
      creator: String(gif.username ?? ''),
      foreign_landing_url: String(gif.url ?? ''),
    })),
  }
}

app.get('/api/stock/images', async (req, res) => {
  const query = String(req.query.q ?? '').trim().slice(0, 160) || 'nature'
  const page = Math.min(1000, Math.max(1, Number(req.query.page ?? 1) || 1))
  const category = String(req.query.category ?? 'photograph')
  if (!['photograph', 'illustration', 'vector'].includes(category)) {
    throw Object.assign(new Error('Unsupported stock image category.'), { status: 400 })
  }
  const params = new URLSearchParams({
    q: query,
    page: String(page),
    page_size: '24',
    license_type: 'commercial',
    mature: 'false',
    category,
    format: 'json',
  })
  const extension = String(req.query.extension ?? '')
  if (extension === 'gif' && process.env.GIPHY_API_KEY) {
    res.json(await giphySearch(process.env.GIPHY_API_KEY, query, page))
    return
  }
  if (process.env.PIXABAY_API_KEY && extension !== 'gif') {
    res.json(await pixabaySearch(process.env.PIXABAY_API_KEY, query, page, category))
    return
  }
  if (extension === 'gif') params.set('extension', extension)
  let response: globalThis.Response
  try {
    response = await fetch(`https://api.openverse.org/v1/images/?${params}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw Object.assign(new Error('The stock photo service could not be reached. Please try again.'), { status: 502 })
  }
  if (!response.ok) {
    const status = response.status === 429 ? 503 : 502
    throw Object.assign(
      new Error(response.status === 429 ? 'The stock photo service is busy. Try again shortly.' : `The stock photo service returned an error (${response.status}).`),
      { status },
    )
  }
  const data = await response.json() as { results?: unknown[]; page_count?: number }
  if (!Array.isArray(data.results)) {
    throw Object.assign(new Error('The stock photo service returned an invalid response.'), { status: 502 })
  }
  res.json({ results: data.results, page_count: Number(data.page_count ?? 0) })
})

app.get('/api/templates', async (req, res) => {
  const page = Math.max(0, Number(req.query.page ?? 0) || 0)
  const size = Math.min(100, Math.max(1, Number(req.query.size ?? 24) || 24))
  const terms: string[] = ['t.published = TRUE']
  const params: unknown[] = []
  if (req.query.categoryId != null) terms.push('t.category_id = ?'), params.push(Number(req.query.categoryId))
  if (req.query.q) terms.push('(t.title LIKE ? OR t.tags LIKE ?)'), params.push(`%${req.query.q}%`, `%${req.query.q}%`)
  const where = terms.join(' AND ')
  const total = await one<AnyRow>(`SELECT COUNT(*) AS total FROM templates t WHERE ${where}`, params)
  const found = await rows<AnyRow>(
    `SELECT t.id, t.title, t.category_id AS categoryId, c.name AS categoryName, t.width, t.height,
       t.thumbnail, t.tags FROM templates t LEFT JOIN categories c ON c.id = t.category_id
     WHERE ${where} ORDER BY t.id DESC LIMIT ? OFFSET ?`,
    [...params, size, page * size],
  )
  res.json({
    items: found.map((item) => ({
      id: Number(item.id), title: String(item.title),
      ...(item.categoryId == null ? {} : { categoryId: Number(item.categoryId), categoryName: String(item.categoryName) }),
      width: Number(item.width), height: Number(item.height),
      ...(item.thumbnail ? { thumbnail: String(item.thumbnail) } : {}),
      ...(item.tags ? { tags: String(item.tags) } : {}),
    })),
    total: Number(total?.total ?? 0),
  })
})

app.get('/api/templates/:id/design', async (req, res) => {
  const template = await one<AnyRow>('SELECT design FROM templates WHERE id = ? AND published = TRUE', [idOf(req.params.id)])
  if (!template) throw Object.assign(new Error('Template not found.'), { status: 404 })
  res.json(jsonValue(template.design))
})

app.post('/api/templates/from-project/:projectId', async (req, res) => {
  const caller = userOf(req)
  const projectId = idOf(req.params.projectId)
  await requireProjectAccess(projectId, caller.id, true)
  await assertDesignApprovedForPublishing(projectId, caller.id)
  const body = objectBody(req)
  const project = await one<AnyRow>('SELECT width, height, thumbnail FROM projects WHERE id = ?', [projectId])
  if (!project) throw Object.assign(new Error('Project not found.'), { status: 404 })
  const id = insertId(await run(
    `INSERT INTO templates (category_id, author_id, title, width, height, thumbnail, design, tags, published)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
    [body.categoryId ?? null, caller.id, String(body.title ?? 'Untitled template'), project.width, project.height,
      body.thumbnail ?? project.thumbnail, JSON.stringify(await loadDesign(projectId)), body.tags ?? null],
  ))
  res.status(201).json({
    id, title: String(body.title ?? 'Untitled template'), categoryId: body.categoryId ?? null,
    width: Number(project.width), height: Number(project.height), thumbnail: body.thumbnail ?? project.thumbnail,
    tags: body.tags ?? '',
  })
})

app.get('/api/collaborators/project/:projectId', async (req, res) => {
  const projectId = idOf(req.params.projectId)
  await requireProjectAccess(projectId, userOf(req).id)
  const owner = await one<AnyRow>(
    'SELECT u.id AS userId, u.name, u.email, u.avatar_url AS avatarUrl FROM projects p JOIN users u ON u.id = p.owner_id WHERE p.id = ?',
    [projectId],
  )
  const collabs = await rows<AnyRow>(
    `SELECT u.id AS userId, u.name, u.email, u.avatar_url AS avatarUrl, c.role
     FROM collaborators c JOIN users u ON u.id = c.user_id WHERE c.project_id = ? ORDER BY u.name`,
    [projectId],
  )
  res.json([
    ...(owner ? [{ ...owner, userId: Number(owner.userId), owner: true, role: 'OWNER' }] : []),
    ...collabs.map((item) => ({ ...item, userId: Number(item.userId), owner: false })),
  ])
})

app.post('/api/collaborators/project/:projectId', async (req, res) => {
  const projectId = idOf(req.params.projectId)
  const caller = userOf(req)
  const role = await requireProjectAccess(projectId, caller.id, true)
  if (role !== 'OWNER') throw Object.assign(new Error('Only the project owner can invite collaborators.'), { status: 403 })
  const body = objectBody(req)
  const invitee = await one<AnyRow>('SELECT id, name, email, avatar_url AS avatarUrl FROM users WHERE email = ?', [String(body.email ?? '').trim().toLowerCase()])
  if (!invitee) throw Object.assign(new Error('No DesignHub account exists for that email.'), { status: 404 })
  if (Number(invitee.id) === caller.id) throw Object.assign(new Error('You already own this project.'), { status: 400 })
  const access = ['VIEWER', 'COMMENTER', 'MAKER', 'EDITOR'].includes(String(body.role)) ? String(body.role) : 'MAKER'
  await run(
    'INSERT INTO collaborators (project_id, user_id, role) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role = VALUES(role)',
    [projectId, invitee.id, access],
  )
  await createNotification(Number(invitee.id), 'INVITATION', `${caller.name} shared a project with you.`, `/editor/${projectId}`)
  res.status(201).json({ userId: Number(invitee.id), name: invitee.name, email: invitee.email, avatarUrl: invitee.avatarUrl, role: access, owner: false })
})

app.delete('/api/collaborators/project/:projectId/:userId', async (req, res) => {
  const projectId = idOf(req.params.projectId)
  const caller = userOf(req)
  const targetId = idOf(req.params.userId)
  if (targetId !== caller.id && await requireProjectAccess(projectId, caller.id) !== 'OWNER') {
    throw Object.assign(new Error('Only the project owner can remove collaborators.'), { status: 403 })
  }
  await run('DELETE FROM collaborators WHERE project_id = ? AND user_id = ?', [projectId, targetId])
  res.status(204).end()
})

app.get('/api/share-links/project/:projectId', async (req, res) => {
  const projectId = idOf(req.params.projectId)
  if (await requireProjectAccess(projectId, userOf(req).id) !== 'OWNER') {
    throw Object.assign(new Error('Only the project owner can manage share links.'), { status: 403 })
  }
  const found = await rows<AnyRow>(
    'SELECT id, token, role, expires_at AS expiresAt FROM share_links WHERE project_id = ? AND revoked = FALSE ORDER BY id DESC',
    [projectId],
  )
  res.json(found.map((link) => ({
    id: Number(link.id), token: String(link.token), role: String(link.role),
    ...(link.expiresAt ? { expiresAt: new Date(String(link.expiresAt)).toISOString() } : {}),
  })))
})

app.post('/api/share-links/project/:projectId', async (req, res) => {
  const projectId = idOf(req.params.projectId)
  if (await requireProjectAccess(projectId, userOf(req).id) !== 'OWNER') {
    throw Object.assign(new Error('Only the project owner can manage share links.'), { status: 403 })
  }
  const body = objectBody(req)
  const role = ['VIEWER', 'COMMENTER', 'MAKER'].includes(String(body.role)) ? String(body.role) : 'VIEWER'
  const token = randomBytes(24).toString('base64url')
  const days = Math.max(1, Math.min(365, Number(body.expiresInDays ?? 0)))
  const expiresAt = days ? new Date(Date.now() + days * 86400000) : null
  const id = insertId(await run('INSERT INTO share_links (project_id, token, role, expires_at) VALUES (?, ?, ?, ?)', [projectId, token, role, expiresAt]))
  res.status(201).json({ id, token, role, ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}) })
})

app.delete('/api/share-links/project/:projectId/:linkId', async (req, res) => {
  const projectId = idOf(req.params.projectId)
  if (await requireProjectAccess(projectId, userOf(req).id) !== 'OWNER') {
    throw Object.assign(new Error('Only the project owner can manage share links.'), { status: 403 })
  }
  await run('UPDATE share_links SET revoked = TRUE WHERE id = ? AND project_id = ?', [idOf(req.params.linkId), projectId])
  res.status(204).end()
})

app.post('/api/share-links/accept/:token', async (req, res) => {
  const link = await one<AnyRow>(
    `SELECT project_id AS projectId, role FROM share_links WHERE token = ? AND revoked = FALSE
     AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
    [String(req.params.token)],
  )
  if (!link) throw Object.assign(new Error('This share link is invalid or expired.'), { status: 404 })
  const caller = userOf(req)
  await run(
    'INSERT INTO collaborators (project_id, user_id, role) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role = VALUES(role)',
    [link.projectId, caller.id, link.role],
  )
  res.json({ projectId: Number(link.projectId) })
})

app.get('/api/public/shares/:token', async (req, res) => {
  const link = await one<AnyRow>(
    `SELECT project_id AS projectId, role FROM share_links WHERE token = ? AND revoked = FALSE
     AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
    [String(req.params.token)],
  )
  if (!link) throw Object.assign(new Error('This share link is invalid or expired.'), { status: 404 })
  const projectId = Number(link.projectId)
  const owner = await one<AnyRow>('SELECT owner_id AS ownerId FROM projects WHERE id = ?', [projectId])
  if (!owner) throw Object.assign(new Error('Project not found.'), { status: 404 })
  res.json({
    project: { ...(await projectSummary(projectId, Number(owner.ownerId))), access: String(link.role) },
    design: await loadDesign(projectId),
    role: String(link.role),
  })
})

function commentDto(comment: AnyRow) {
  return {
    id: Number(comment.id),
    ...(comment.parentId == null ? {} : { parentId: Number(comment.parentId) }),
    ...(comment.pageId ? { pageId: String(comment.pageId) } : {}),
    ...(comment.elementId ? { elementId: String(comment.elementId) } : {}),
    ...(comment.x == null ? {} : { x: Number(comment.x) }),
    ...(comment.y == null ? {} : { y: Number(comment.y) }),
    body: String(comment.body), mentions: jsonValue(comment.mentions, []), resolved: Boolean(comment.resolved),
    authorId: Number(comment.authorId), authorName: String(comment.authorName),
    ...(comment.authorAvatar ? { authorAvatar: String(comment.authorAvatar) } : {}),
    createdAt: new Date(String(comment.createdAt)).toISOString(),
  }
}

async function getCommentDto(commentId: number) {
  const comment = await one<AnyRow>(
    `SELECT c.id, c.parent_id AS parentId, c.page_id AS pageId, c.element_id AS elementId, c.x, c.y,
       c.body, c.mentions, c.resolved, c.author_id AS authorId, c.created_at AS createdAt,
       u.name AS authorName, u.avatar_url AS authorAvatar
     FROM comments c JOIN users u ON u.id = c.author_id WHERE c.id = ?`,
    [commentId],
  )
  if (!comment) throw Object.assign(new Error('Comment not found.'), { status: 404 })
  return commentDto(comment)
}

app.get('/api/comments/project/:projectId', async (req, res) => {
  const projectId = idOf(req.params.projectId)
  await requireProjectAccess(projectId, userOf(req).id)
  const found = await rows<AnyRow>(
    `SELECT c.id, c.parent_id AS parentId, c.page_id AS pageId, c.element_id AS elementId, c.x, c.y, c.body,
      c.mentions, c.resolved, c.author_id AS authorId, c.created_at AS createdAt, u.name AS authorName,
      u.avatar_url AS authorAvatar FROM comments c JOIN users u ON u.id = c.author_id
     WHERE c.project_id = ? ORDER BY c.created_at`,
    [projectId],
  )
  res.json(found.map(commentDto))
})

app.post('/api/comments/project/:projectId', async (req, res) => {
  const projectId = idOf(req.params.projectId)
  const caller = userOf(req)
  const role = await requireProjectAccess(projectId, caller.id)
  if (role === 'VIEWER') throw Object.assign(new Error('You do not have permission to comment.'), { status: 403 })
  const body = objectBody(req)
  const text = String(body.body ?? '').trim()
  if (!text) throw Object.assign(new Error('Comment text is required.'), { status: 400 })
  const id = insertId(await run(
    `INSERT INTO comments (project_id, author_id, parent_id, page_id, element_id, x, y, body, mentions)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [projectId, caller.id, body.parentId ?? null, body.pageId ?? null, body.elementId ?? null, body.x ?? null, body.y ?? null, text, JSON.stringify(body.mentions ?? [])],
  ))
  const comment = await getCommentDto(id)
  publishRoom(projectId, `/topic/project.${projectId}.events`, { type: 'COMMENT_UPSERT', payload: comment })
  res.status(201).json(comment)
})

app.patch('/api/comments/project/:projectId/:commentId', async (req, res) => {
  const projectId = idOf(req.params.projectId)
  const commentId = idOf(req.params.commentId)
  await requireProjectAccess(projectId, userOf(req).id, true)
  const resolved = Boolean(objectBody(req).resolved)
  const exists = await one<AnyRow>('SELECT id FROM comments WHERE id = ? AND project_id = ?', [commentId, projectId])
  if (!exists) throw Object.assign(new Error('Comment not found.'), { status: 404 })
  await run('UPDATE comments SET resolved = ? WHERE id = ? AND project_id = ?', [resolved, commentId, projectId])
  const comment = await getCommentDto(commentId)
  publishRoom(projectId, `/topic/project.${projectId}.events`, { type: 'COMMENT_UPSERT', payload: comment })
  res.json(comment)
})

app.delete('/api/comments/project/:projectId/:commentId', async (req, res) => {
  const caller = userOf(req)
  const projectId = idOf(req.params.projectId)
  await requireProjectAccess(projectId, caller.id)
  const project = await one<AnyRow>('SELECT owner_id AS ownerId FROM projects WHERE id = ?', [projectId])
  const commentId = idOf(req.params.commentId)
  const comment = await one<AnyRow>('SELECT author_id AS authorId FROM comments WHERE id = ? AND project_id = ?', [commentId, projectId])
  if (!comment) throw Object.assign(new Error('Comment not found.'), { status: 404 })
  if (Number(comment.authorId) !== caller.id && Number(project?.ownerId) !== caller.id) {
    throw Object.assign(new Error('Only the comment author or project owner can delete this comment.'), { status: 403 })
  }
  await run('DELETE FROM comments WHERE id = ? AND project_id = ? AND (author_id = ? OR ? = ?)', [
    commentId, projectId, caller.id, Number(project?.ownerId) === caller.id ? 1 : 0, 1,
  ])
  publishRoom(projectId, `/topic/project.${projectId}.events`, { type: 'COMMENT_DELETE', payload: commentId })
  res.status(204).end()
})

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
})

await mkdir(storageDir, { recursive: true })
app.post('/api/upload', upload.single('file'), async (req, res) => {
  const caller = userOf(req)
  if (!req.file) throw Object.assign(new Error('Choose a file to upload.'), { status: 400 })
  const usage = await usageOf(caller.id)
  if (usage.storageBytes + req.file.size > usage.plan.storageBytes) {
    throw Object.assign(new Error(`This upload would exceed the storage included in your ${usage.plan.name} plan.`), { status: 403 })
  }
  if (req.body.brandKitId) {
    const brandKit = await one<AnyRow>('SELECT id FROM brand_kits WHERE id = ? AND owner_id = ?', [Number(req.body.brandKitId), caller.id])
    if (!brandKit) throw Object.assign(new Error('Brand kit not found.'), { status: 404 })
  }
  const mimeType = req.file.mimetype
  const kind = typeof req.body.kind === 'string' && req.body.kind
    ? req.body.kind
    : mimeType.startsWith('image/')
      ? 'image'
      : mimeType.startsWith('video/')
        ? 'video'
        : mimeType.startsWith('audio/')
          ? 'audio'
          : 'upload'
  const asset = await persistBuffer(
    caller, req.file.buffer, req.file.originalname, mimeType, kind,
    req.body.brandKitId ? Number(req.body.brandKitId) : null,
  )
  res.status(201).json(asset)
})

app.get('/api/upload', async (req, res) => {
  const params: unknown[] = [userOf(req).id]
  const kind = typeof req.query.kind === 'string' ? req.query.kind : ''
  const kindClause = kind ? " AND (kind = ? OR (kind = 'upload' AND mime_type LIKE ?))" : ''
  if (kind) params.push(kind, `${kind}/%`)
  const found = await rows<AnyRow>(
    `SELECT id, kind, file_name AS fileName, stored_name AS storedName, mime_type AS mimeType,
      size_bytes AS sizeBytes, width, height, created_at AS createdAt FROM assets WHERE owner_id = ?${kindClause} ORDER BY created_at DESC`,
    params,
  )
  res.json(found.map(publicAsset))
})

app.delete('/api/upload/:id', async (req, res) => {
  const asset = await one<AnyRow>('SELECT stored_name AS storedName FROM assets WHERE id = ? AND owner_id = ?', [idOf(req.params.id), userOf(req).id])
  if (asset) {
    await run('DELETE FROM assets WHERE id = ? AND owner_id = ?', [idOf(req.params.id), userOf(req).id])
    await unlink(path.join(storageDir, String(asset.storedName))).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
  res.status(204).end()
})

app.get('/api/files/:name', async (req, res) => {
  const name = String(req.params.name)
  if (!/^[A-Za-z0-9-]+\.[a-z0-9]+$/.test(name)) throw Object.assign(new Error('File not found.'), { status: 404 })
  const asset = await one<AnyRow>('SELECT mime_type AS mimeType FROM assets WHERE stored_name = ?', [name])
  if (!asset) throw Object.assign(new Error('File not found.'), { status: 404 })
  res.type(String(asset.mimeType ?? 'application/octet-stream')).sendFile(path.join(storageDir, name))
})

app.post('/api/export', async (req, res) => {
  const caller = userOf(req)
  const body = objectBody(req)
  const projectId = body.projectId == null ? null : Number(body.projectId)
  if (projectId != null) await requireProjectAccess(projectId, caller.id)
  const format = String(body.format ?? '').toLowerCase()
  if (!['png', 'jpg', 'pdf', 'svg', 'zip', 'gif', 'mp4', 'webm', 'xlsx'].includes(format)) {
    throw Object.assign(new Error('Unsupported export format.'), { status: 400 })
  }
  const usage = await usageOf(caller.id)
  if (usage.exports >= usage.plan.exportsPerMonth) {
    throw Object.assign(new Error(`You have used all ${usage.plan.exportsPerMonth} exports included in your ${usage.plan.name} plan this month.`), { status: 403 })
  }
  const id = insertId(await run(
    'INSERT INTO exports (user_id, project_id, format, page_count, size_bytes) VALUES (?, ?, ?, ?, ?)',
    [caller.id, projectId, format, Number(body.pageCount ?? 1), Math.max(0, Number(body.sizeBytes ?? 0))],
  ))
  await run('INSERT INTO activities (actor_id, project_id, type, meta) VALUES (?, ?, ?, ?)', [caller.id, projectId, 'export.created', format])
  res.status(201).json({ id, projectId, format, pageCount: Number(body.pageCount ?? 1), sizeBytes: Math.max(0, Number(body.sizeBytes ?? 0)) })
})

app.get('/api/export', async (req, res) => {
  const found = await rows<AnyRow>(
    `SELECT e.id, e.project_id AS projectId, p.title AS projectTitle, e.format, e.page_count AS pageCount,
      e.size_bytes AS sizeBytes, e.created_at AS createdAt FROM exports e
     LEFT JOIN projects p ON p.id = e.project_id WHERE e.user_id = ? ORDER BY e.created_at DESC LIMIT 50`,
    [userOf(req).id],
  )
  res.json(found.map((job) => ({
    id: Number(job.id), projectId: job.projectId == null ? null : Number(job.projectId),
    projectTitle: job.projectTitle ?? null, format: String(job.format), pageCount: Number(job.pageCount),
    sizeBytes: Number(job.sizeBytes), createdAt: new Date(String(job.createdAt)).toISOString(),
  })))
})

app.get('/api/brand', async (req, res) => {
  const found = await rows<AnyRow>(
    'SELECT id, name, colors, fonts, guidelines FROM brand_kits WHERE owner_id = ? ORDER BY name',
    [userOf(req).id],
  )
  res.json(found.map((kit) => ({
    id: Number(kit.id), name: String(kit.name), colors: jsonValue(kit.colors, []),
    fonts: jsonValue(kit.fonts, []), ...(kit.guidelines ? { guidelines: String(kit.guidelines) } : {}), assets: [],
  })))
})

app.post('/api/brand', async (req, res) => {
  const caller = userOf(req)
  const body = objectBody(req)
  const name = String(body.name ?? '').trim()
  if (!name) throw Object.assign(new Error('Brand kit name is required.'), { status: 400 })
  const id = insertId(await run('INSERT INTO brand_kits (owner_id, name, colors, fonts, guidelines) VALUES (?, ?, ?, ?, ?)', [
    caller.id, name, JSON.stringify(body.colors ?? []), JSON.stringify(body.fonts ?? []), body.guidelines ?? null,
  ]))
  res.status(201).json({ id, name, colors: body.colors ?? [], fonts: body.fonts ?? [], guidelines: body.guidelines ?? '', assets: [] })
})

app.put('/api/brand/:id', async (req, res) => {
  const caller = userOf(req)
  const kitId = idOf(req.params.id)
  const body = objectBody(req)
  const name = String(body.name ?? '').trim()
  if (!name) throw Object.assign(new Error('Brand kit name is required.'), { status: 400 })
  const exists = await one<AnyRow>('SELECT id FROM brand_kits WHERE id = ? AND owner_id = ?', [kitId, caller.id])
  if (!exists) throw Object.assign(new Error('Brand kit not found.'), { status: 404 })
  await run(
    'UPDATE brand_kits SET name = ?, colors = ?, fonts = ?, guidelines = ? WHERE id = ? AND owner_id = ?',
    [name, JSON.stringify(body.colors ?? []), JSON.stringify(body.fonts ?? []), body.guidelines ?? null, kitId, caller.id],
  )
  res.json({ id: kitId, name, colors: body.colors ?? [], fonts: body.fonts ?? [], guidelines: body.guidelines ?? '', assets: [] })
})

app.delete('/api/brand/:id', async (req, res) => {
  await run('DELETE FROM brand_kits WHERE id = ? AND owner_id = ?', [idOf(req.params.id), userOf(req).id])
  res.status(204).end()
})

app.get('/api/teams', async (req, res) => {
  const caller = userOf(req)
  const found = await rows<AnyRow>(
    `SELECT t.id, t.name, t.owner_id AS ownerId, COALESCE(m.role, 'OWNER') AS myRole,
       (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) + 1 AS memberCount
     FROM teams t LEFT JOIN team_members m ON m.team_id = t.id AND m.user_id = ?
     WHERE t.owner_id = ? OR m.user_id IS NOT NULL ORDER BY t.name`,
    [caller.id, caller.id],
  )
  res.json(found.map((team) => ({
    id: Number(team.id), name: String(team.name), ownerId: Number(team.ownerId),
    memberCount: Number(team.memberCount), myRole: String(team.myRole),
  })))
})

app.post('/api/teams', async (req, res) => {
  const caller = userOf(req)
  const name = String(objectBody(req).name ?? '').trim()
  if (!name) throw Object.assign(new Error('Team name is required.'), { status: 400 })
  const id = insertId(await run('INSERT INTO teams (name, owner_id) VALUES (?, ?)', [name, caller.id]))
  res.status(201).json({ id, name, ownerId: caller.id, memberCount: 1, myRole: 'OWNER' })
})

app.delete('/api/teams/:id', async (req, res) => {
  const id = idOf(req.params.id)
  const caller = userOf(req)
  const team = await one<AnyRow>('SELECT id FROM teams WHERE id = ? AND owner_id = ?', [id, caller.id])
  if (!team) throw Object.assign(new Error('Only the team owner can delete this team.'), { status: 403 })
  await run('DELETE FROM team_members WHERE team_id = ?', [id])
  await run('UPDATE projects SET team_id = NULL WHERE team_id = ?', [id])
  await run('UPDATE brand_kits SET team_id = NULL WHERE team_id = ?', [id])
  await run('DELETE FROM teams WHERE id = ?', [id])
  res.status(204).end()
})

app.get('/api/teams/:id/members', async (req, res) => {
  const teamId = idOf(req.params.id)
  const caller = userOf(req)
  const team = await one<AnyRow>(
    'SELECT t.owner_id AS ownerId FROM teams t LEFT JOIN team_members m ON m.team_id = t.id AND m.user_id = ? WHERE t.id = ? AND (t.owner_id = ? OR m.user_id IS NOT NULL)',
    [caller.id, teamId, caller.id],
  )
  if (!team) throw Object.assign(new Error('Team not found.'), { status: 404 })
  const owner = await one<AnyRow>(
    'SELECT id AS userId, name, email, avatar_url AS avatarUrl FROM users WHERE id = ?',
    [team.ownerId],
  )
  const found = await rows<AnyRow>(
    `SELECT u.id AS userId, u.name, u.email, u.avatar_url AS avatarUrl, m.role
     FROM team_members m JOIN users u ON u.id = m.user_id WHERE m.team_id = ?`,
    [teamId],
  )
  res.json([...(owner ? [{ ...owner, role: 'OWNER' }] : []), ...found].map((member) => ({ ...member, userId: Number(member.userId) })))
})

app.post('/api/teams/:id/members', async (req, res) => {
  const teamId = idOf(req.params.id)
  const caller = userOf(req)
  const team = await one<AnyRow>('SELECT id FROM teams WHERE id = ? AND owner_id = ?', [teamId, caller.id])
  if (!team) throw Object.assign(new Error('Only the team owner can add members.'), { status: 403 })
  const body = objectBody(req)
  const email = String(body.email ?? '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error('Enter a valid email address.'), { status: 400 })
  const member = await one<AnyRow>('SELECT id AS userId, name, email, avatar_url AS avatarUrl FROM users WHERE email = ?', [email])
  if (!member) throw Object.assign(new Error('No DesignHub account exists for that email.'), { status: 404 })
  const isAlreadyMember = await one<AnyRow>('SELECT id FROM team_members WHERE team_id = ? AND user_id = ?', [teamId, member.userId])
  if (!isAlreadyMember) {
    const usage = await usageOf(caller.id)
    const currentCount = await one<AnyRow>('SELECT COUNT(*) AS count FROM team_members WHERE team_id = ?', [teamId])
    if (Number(currentCount?.count ?? 0) + 1 >= usage.plan.teamSeats) {
      throw Object.assign(new Error(`Your ${usage.plan.name} plan allows ${usage.plan.teamSeats} team seats.`), { status: 403 })
    }
  }
  const role = String(body.role ?? 'MAKER')
  if (!['VIEWER', 'COMMENTER', 'MAKER', 'EDITOR'].includes(role)) {
    throw Object.assign(new Error('Choose a valid team role.'), { status: 400 })
  }
  await run('INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role = VALUES(role)', [teamId, member.userId, role])
  let editorInvitation: { sent: boolean; problem?: string; emailConfigured: boolean } | undefined
  if (role === 'EDITOR') {
    const teamName = await one<AnyRow>('SELECT name FROM teams WHERE id = ?', [teamId])
    const subject = 'You have been assigned as an Editor in DesignHub'
    const message = `${caller.name} assigned you the Editor role in the DesignHub team "${String(teamName?.name ?? 'your team')}". You can now review and approve designs.`
    await createNotification(Number(member.userId), 'INVITATION', message, '/workspace')
    const mail = mailConfiguration()
    const delivery = await sendTransactionalEmail(
      String(member.email), String(member.name), subject,
      `${message}\n\nOpen DesignHub: ${frontendUrl}/workspace`,
      `<p>${htmlEscape(message)}</p><p><a href="${htmlEscape(`${frontendUrl}/workspace`)}">Open DesignHub</a></p>`,
    )
    editorInvitation = {
      sent: delivery.sent,
      ...(delivery.problem ? { problem: delivery.problem } : {}),
      emailConfigured: Boolean(mail.host && mail.user),
    }
  }
  res.status(201).json({ ...member, userId: Number(member.userId), role, ...(editorInvitation ? { editorInvitation } : {}) })
})

app.delete('/api/teams/:id/members/:userId', async (req, res) => {
  const teamId = idOf(req.params.id)
  const caller = userOf(req)
  const team = await one<AnyRow>('SELECT id FROM teams WHERE id = ? AND owner_id = ?', [teamId, caller.id])
  if (!team) throw Object.assign(new Error('Only the team owner can remove members.'), { status: 403 })
  await run('DELETE FROM team_members WHERE team_id = ? AND user_id = ?', [teamId, idOf(req.params.userId)])
  res.status(204).end()
})

const memoryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } })

async function persistBuffer(user: AuthUser, buffer: Buffer, filename: string, contentType: string, kind: string, brandKitId: number | null = null) {
  const storedName = `${randomBytes(18).toString('hex')}${path.extname(filename).toLowerCase().slice(0, 12)}`
  await import('node:fs/promises').then(({ writeFile }) => writeFile(path.join(storageDir, storedName), buffer))
  const id = insertId(await run(
    'INSERT INTO assets (owner_id, brand_kit_id, kind, file_name, stored_name, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [user.id, brandKitId, kind, filename, storedName, contentType, buffer.byteLength],
  ))
  return publicAsset({
    id, kind, fileName: filename, storedName, mimeType: contentType, sizeBytes: buffer.byteLength, createdAt: new Date(),
  })
}

async function requestMlWorker(pathname: string, init: RequestInit) {
  let response: Response
  try {
    response = await fetch(`${mlWorkerUrl}${pathname}`, init)
  } catch (error) {
    if (error instanceof TypeError) {
      throw Object.assign(
        new Error('The image-processing service is unavailable. Start the Python ML worker and try again.'),
        { status: 503 },
      )
    }
    throw error
  }
  if (!response.ok) {
    throw Object.assign(new Error(`Image processing failed with status ${response.status}.`), { status: 502 })
  }
  return response
}

app.post('/api/background-removal', memoryUpload.single('image'), async (req, res) => {
  const image = req.file
  if (!image) throw Object.assign(new Error('Image file is required.'), { status: 400 })
  const form = new FormData()
  form.append('image', new Blob([Uint8Array.from(image.buffer)], { type: image.mimetype }), image.originalname)
  const response = await requestMlWorker('/remove-background', { method: 'POST', body: form })
  const saved = await persistBuffer(userOf(req), Buffer.from(await response.arrayBuffer()), 'background-removed.png', 'image/png', 'image')
  res.json(saved)
})

app.post('/api/design-decomposition', memoryUpload.single('image'), async (req, res) => {
  const image = req.file
  if (!image) throw Object.assign(new Error('Image file is required.'), { status: 400 })
  const form = new FormData()
  form.append('image', new Blob([Uint8Array.from(image.buffer)], { type: image.mimetype }), image.originalname)
  const response = await requestMlWorker(
    `/segment?max_segments=${encodeURIComponent(String(req.query.maxLayers ?? req.body.maxLayers ?? 8))}`,
    { method: 'POST', body: form },
  )
  const result = await response.json() as { width: number; height: number; segments?: { cutout: string; bbox: number[]; score: number }[]; background?: string }
  const layers = []
  for (const segment of result.segments ?? []) {
    const asset = await persistBuffer(userOf(req), Buffer.from(segment.cutout, 'base64'), 'segment.png', 'image/png', 'image')
    layers.push({ url: asset.url, bbox: segment.bbox, score: segment.score })
  }
  let backgroundUrl: string | undefined
  if (result.background) {
    const asset = await persistBuffer(userOf(req), Buffer.from(result.background, 'base64'), 'background.png', 'image/png', 'image')
    backgroundUrl = asset.url
  }
  res.json({ width: result.width, height: result.height, layers, ...(backgroundUrl ? { backgroundUrl } : {}) })
})

app.post('/api/design-decomposition/inpaint', memoryUpload.fields([{ name: 'image', maxCount: 1 }, { name: 'mask', maxCount: 1 }]), async (req, res) => {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined
  const image = files?.image?.[0]
  const mask = files?.mask?.[0]
  if (!image || !mask) throw Object.assign(new Error('Both image and mask files are required.'), { status: 400 })
  const form = new FormData()
  form.append('image', new Blob([Uint8Array.from(image.buffer)], { type: image.mimetype }), image.originalname)
  form.append('mask', new Blob([Uint8Array.from(mask.buffer)], { type: mask.mimetype }), mask.originalname)
  const response = await requestMlWorker('/inpaint', { method: 'POST', body: form })
  res.json(await persistBuffer(userOf(req), Buffer.from(await response.arrayBuffer()), 'inpainted.png', 'image/png', 'image'))
})

// --- Video editor (Phase 1): isolated from the graphic design editor's projects/pages/elements tables ---

interface VideoTimeline {
  tracks: { id: string; kind: 'video' | 'audio' | 'text'; name: string; locked: boolean; muted: boolean; hidden: boolean; clips: Record<string, unknown>[] }[]
}

function emptyTimeline(): VideoTimeline {
  return { tracks: [] }
}

function videoProjectSummary(row: AnyRow) {
  return {
    id: Number(row.id),
    title: String(row.title),
    width: Number(row.width),
    height: Number(row.height),
    fps: Number(row.fps),
    durationSeconds: Number(row.durationSeconds ?? 0),
    createdAt: new Date(String(row.createdAt)).toISOString(),
    updatedAt: new Date(String(row.updatedAt)).toISOString(),
  }
}

async function requireVideoProjectAccess(id: number, userId: number) {
  const project = await one<AnyRow>('SELECT id FROM video_projects WHERE id = ? AND owner_id = ? AND deleted_at IS NULL', [id, userId])
  if (!project) throw Object.assign(new Error('Video project not found.'), { status: 404 })
}

app.get('/api/video-projects', async (req, res) => {
  const caller = userOf(req)
  const found = await rows<AnyRow>(
    `SELECT id, title, width, height, fps, duration_seconds AS durationSeconds, created_at AS createdAt, updated_at AS updatedAt
     FROM video_projects WHERE owner_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC`,
    [caller.id],
  )
  res.json(found.map(videoProjectSummary))
})

app.post('/api/video-projects', async (req, res) => {
  const caller = userOf(req)
  const body = objectBody(req)
  const title = String(body.title ?? '').trim() || 'Untitled video'
  if (title.length > 200) throw Object.assign(new Error('Title is too long.'), { status: 400 })
  const width = Math.max(64, Math.min(4096, Number(body.width) || 1080))
  const height = Math.max(64, Math.min(4096, Number(body.height) || 1920))
  const fps = Math.max(1, Math.min(120, Number(body.fps) || 30))
  const id = insertId(await run(
    'INSERT INTO video_projects (owner_id, title, width, height, fps, timeline) VALUES (?, ?, ?, ?, ?, ?)',
    [caller.id, title, width, height, fps, JSON.stringify(emptyTimeline())],
  ))
  const row = await one<AnyRow>(
    `SELECT id, title, width, height, fps, duration_seconds AS durationSeconds, created_at AS createdAt, updated_at AS updatedAt
     FROM video_projects WHERE id = ?`,
    [id],
  )
  res.status(201).json(videoProjectSummary(row!))
})

app.get('/api/video-projects/:id', async (req, res) => {
  const caller = userOf(req)
  const id = idOf(req.params.id)
  await requireVideoProjectAccess(id, caller.id)
  const row = await one<AnyRow>(
    `SELECT id, title, width, height, fps, duration_seconds AS durationSeconds, timeline, created_at AS createdAt, updated_at AS updatedAt
     FROM video_projects WHERE id = ?`,
    [id],
  )
  res.json({ ...videoProjectSummary(row!), timeline: jsonValue(row!.timeline, emptyTimeline()) })
})

app.put('/api/video-projects/:id', async (req, res) => {
  const caller = userOf(req)
  const id = idOf(req.params.id)
  await requireVideoProjectAccess(id, caller.id)
  const body = objectBody(req)
  const sets: string[] = []
  const values: unknown[] = []
  if (typeof body.title === 'string') {
    const title = body.title.trim()
    if (!title || title.length > 200) throw Object.assign(new Error('Enter a valid title.'), { status: 400 })
    sets.push('title = ?')
    values.push(title)
  }
  if (body.timeline !== undefined) {
    sets.push('timeline = ?')
    values.push(JSON.stringify(body.timeline))
  }
  if (body.durationSeconds !== undefined) {
    sets.push('duration_seconds = ?')
    values.push(Math.max(0, Number(body.durationSeconds) || 0))
  }
  if (body.width !== undefined || body.height !== undefined) {
    const width = Math.max(64, Math.min(4096, Number(body.width)))
    const height = Math.max(64, Math.min(4096, Number(body.height)))
    if (!Number.isFinite(width) || !Number.isFinite(height)) throw Object.assign(new Error('Enter a valid canvas size.'), { status: 400 })
    sets.push('width = ?', 'height = ?')
    values.push(width, height)
  }
  if (!sets.length) throw Object.assign(new Error('Nothing to update.'), { status: 400 })
  await run(`UPDATE video_projects SET ${sets.join(', ')} WHERE id = ?`, [...values, id])
  res.status(204).end()
})

app.delete('/api/video-projects/:id', async (req, res) => {
  const caller = userOf(req)
  const id = idOf(req.params.id)
  await requireVideoProjectAccess(id, caller.id)
  await run('UPDATE video_projects SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [id])
  res.status(204).end()
})

function resolveAssetPath(url: string): string {
  const marker = '/api/files/'
  const at = url.indexOf(marker)
  if (at === -1) return url
  const storedName = decodeURIComponent(url.slice(at + marker.length).split(/[?#]/)[0] ?? '')
  return path.join(storageDir, storedName)
}

app.post('/api/video-projects/:id/export', async (req, res) => {
  const caller = userOf(req)
  const id = idOf(req.params.id)
  await requireVideoProjectAccess(id, caller.id)
  const row = await one<AnyRow>('SELECT width, height, fps, timeline FROM video_projects WHERE id = ?', [id])
  if (!row) throw Object.assign(new Error('Video project not found.'), { status: 404 })
  const timeline = jsonValue(row.timeline, { tracks: [] }) as { tracks: ExportInput['tracks'] }
  const jobId = startExportJob(
    { width: Number(row.width), height: Number(row.height), fps: Number(row.fps), tracks: timeline.tracks ?? [] },
    resolveAssetPath,
  )
  res.status(202).json({ jobId })
})

app.get('/api/video-projects/:id/export/:jobId', async (req, res) => {
  const caller = userOf(req)
  const id = idOf(req.params.id)
  await requireVideoProjectAccess(id, caller.id)
  const job = getExportJob(String(req.params.jobId))
  if (!job) throw Object.assign(new Error('Export job not found.'), { status: 404 })
  res.json({ status: job.status, progress: job.progress, error: job.error })
})

app.get('/api/video-projects/:id/export/:jobId/download', async (req, res) => {
  const caller = userOf(req)
  const id = idOf(req.params.id)
  await requireVideoProjectAccess(id, caller.id)
  const jobId = String(req.params.jobId)
  const job = getExportJob(jobId)
  if (!job || job.status !== 'done') throw Object.assign(new Error('Export is not ready yet.'), { status: 404 })
  const buffer = await readExportOutput(jobId)
  const project = await one<AnyRow>('SELECT title FROM video_projects WHERE id = ?', [id])
  const asset = await persistBuffer(caller, buffer, `${String(project?.title ?? 'video')}.mp4`, 'video/mp4', 'video-export')
  await cleanupExportJob(jobId)
  res.json(asset)
})

app.get('/health', (_req, res) => res.json({ ok: true }))

app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.path}` })
})

app.use((error: unknown, _req: Request, res: ExpressResponse, _next: NextFunction) => {
  const err = error as Error & { status?: number; code?: string }
  if (err.code === 'ER_DUP_ENTRY') {
    res.status(409).json({ message: 'This record already exists.' })
    return
  }
  if (err instanceof multer.MulterError) {
    res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ message: err.message })
    return
  }
  const status = err.status ?? 500
  if (status >= 500) console.error(err)
  res.status(status).json({ message: status >= 500 ? 'An unexpected server error occurred.' : err.message })
})

interface SocketState {
  user: AuthUser | null
  subscriptions: Map<string, string>
  projectRooms: Set<number>
  sessionId: string
  heartbeat?: NodeJS.Timeout
}

const sockets = new Set<WebSocket>()
const socketState = new WeakMap<WebSocket, SocketState>()
const wss = new WebSocketServer({ noServer: true })
const projectPresence = new Map<number, Map<string, { sessionId: string; userId: number; name: string; color: string }>>()

function sendStomp(socket: WebSocket, destination: string, body: unknown, subscription?: string) {
  if (socket.readyState !== socket.OPEN) return
  const headers = [`destination:${destination}`, 'content-type:application/json']
  if (subscription) headers.unshift(`subscription:${subscription}`)
  socket.send(`MESSAGE\n${headers.join('\n')}\n\n${JSON.stringify(body)}\0`)
}

function decodeFrame(frame: string) {
  const normalized = frame.replace(/^\n+/, '')
  const split = normalized.indexOf('\n\n')
  if (split < 0) return null
  const lines = normalized.slice(0, split).split('\n')
  const command = lines.shift()?.replace(/\r$/, '') ?? ''
  const headers = new Map<string, string>()
  for (const line of lines) {
    const colon = line.indexOf(':')
    if (colon > 0) headers.set(line.slice(0, colon), line.slice(colon + 1).replace(/\r$/, ''))
  }
  return { command, headers, body: normalized.slice(split + 2).replace(/\0$/, '').replace(/\r$/, '') }
}

function publishRoom(projectId: number, destination: string, body: unknown) {
  for (const socket of sockets) {
    const state = socketState.get(socket)
    if (!state?.projectRooms.has(projectId)) continue
    for (const [id, topic] of state.subscriptions) {
      if (topic === destination) sendStomp(socket, destination, body, id)
    }
  }
}

function broadcastPresence(projectId: number) {
  const list = Array.from(projectPresence.get(projectId)?.values() ?? [])
  publishRoom(projectId, `/topic/project.${projectId}.presence`, list)
}

function publishUser(userId: number, destination: string, body: unknown) {
  for (const socket of sockets) {
    const state = socketState.get(socket)
    if (state?.user?.id !== userId) continue
    for (const [id, topic] of state.subscriptions) {
      if (topic === destination) sendStomp(socket, destination, body, id)
    }
  }
}

async function createNotification(userId: number, type: string, message: string, link: string | null) {
  const result = await run(
    'INSERT INTO notifications (created_at, user_id, type, message, link) VALUES (CURRENT_TIMESTAMP, ?, ?, ?, ?)',
    [userId, type, message, link],
  )
  const item = {
    id: insertId(result), type, message, ...(link ? { link } : {}),
    createdAt: new Date().toISOString(), read: false,
  }
  publishUser(userId, '/user/queue/notifications', item)
  return item
}

wss.on('connection', (socket) => {
  sockets.add(socket)
  const state: SocketState = {
    user: null, subscriptions: new Map(), projectRooms: new Set(), sessionId: randomBytes(12).toString('hex'),
  }
  socketState.set(socket, state)
  socket.on('message', async (buffer) => {
    for (const raw of buffer.toString().split('\0')) {
      if (!raw.trim()) continue
      const frame = decodeFrame(raw)
      if (!frame) continue
      const { command, headers, body } = frame
      if (command === 'CONNECT' || command === 'STOMP') {
        const auth = headers.get('Authorization') ?? headers.get('authorization') ?? ''
        const user = auth.startsWith('Bearer ') ? (await import('./auth.js')).parseToken(auth.slice(7)) : null
        if (!user) {
          socket.send('ERROR\nmessage:Sign in again to collaborate\n\n\0')
          socket.close()
          return
        }
        state.user = user
        socket.send('CONNECTED\nversion:1.2\nheart-beat:10000,10000\n\n\0')
        state.heartbeat = setInterval(() => {
          if (socket.readyState === socket.OPEN) socket.send('\n')
        }, 10_000)
        state.heartbeat.unref()
      } else if (command === 'SUBSCRIBE') {
        if (!state.user) {
          socket.send('ERROR\nmessage:Not authenticated\n\n\0')
          continue
        }
        const destination = headers.get('destination') ?? ''
        const match = destination.match(/^\/topic\/project\.(\d+)(?:\..+)?$/)
        if (match) {
          try {
            await requireProjectAccess(Number(match[1]), state.user.id)
            state.projectRooms.add(Number(match[1]))
            state.subscriptions.set(headers.get('id') ?? randomBytes(6).toString('hex'), destination)
          } catch (error) {
            sendStomp(socket, '/user/queue/errors', { message: (error as Error).message })
            continue
          }
        } else if (destination.startsWith('/user/')) {
          state.subscriptions.set(headers.get('id') ?? randomBytes(6).toString('hex'), destination)
        } else {
          sendStomp(socket, '/user/queue/errors', { message: 'Unknown subscription destination.' })
          continue
        }
        socket.send(`RECEIPT\nreceipt-id:${headers.get('receipt') ?? ''}\n\n\0`)
      } else if (command === 'UNSUBSCRIBE') {
        state.subscriptions.delete(headers.get('id') ?? '')
      } else if (command === 'SEND') {
        if (!state.user) continue
        const destination = headers.get('destination') ?? ''
        const match = destination.match(/^\/app\/project\/(\d+)\/(join|leave|ops)$/)
        if (!match) continue
        const projectId = Number(match[1])
        try {
          const role = await requireProjectAccess(projectId, state.user.id, match[2] === 'ops')
          if (match[2] === 'join') {
            state.projectRooms.add(projectId)
            const presence = projectPresence.get(projectId) ?? new Map()
            const colors = ['#6b63ff', '#ff5a36', '#14a38b', '#d47b13']
            const usedColors = new Set(Array.from(presence.values(), (member) => member.color))
            presence.set(state.sessionId, {
              sessionId: state.sessionId, userId: state.user.id, name: state.user.name,
              color: colors.find((color) => !usedColors.has(color)) ?? colors[presence.size % colors.length]!,
            })
            projectPresence.set(projectId, presence)
            broadcastPresence(projectId)
            continue
          }
          if (match[2] === 'leave') {
            state.projectRooms.delete(projectId)
            projectPresence.get(projectId)?.delete(state.sessionId)
            broadcastPresence(projectId)
            continue
          }
          const op = JSON.parse(body) as Record<string, unknown>
          if (op.type === 'CURSOR' || op.type === 'CHAT' || op.type === 'SELECTION') {
            publishRoom(projectId, `/topic/project.${projectId}`, { op, userId: state.user.id, userName: state.user.name, revision: 0 })
            continue
          }
          if (!editRoles.has(role)) throw Object.assign(new Error('You do not have permission to edit this project.'), { status: 403 })
          const revision = await applyDesignOp(projectId, op)
          publishRoom(projectId, `/topic/project.${projectId}`, { op, userId: state.user.id, userName: state.user.name, revision })
          await publishApprovalRevision(projectId)
        } catch (error) {
          sendStomp(socket, '/user/queue/errors', { message: (error as Error).message || 'Change rejected.' })
        }
      } else if (command === 'DISCONNECT') {
        socket.close()
      }
    }
  })
  socket.on('close', () => {
    sockets.delete(socket)
    clearInterval(state.heartbeat)
    for (const projectId of state.projectRooms) {
      projectPresence.get(projectId)?.delete(state.sessionId)
      broadcastPresence(projectId)
    }
  })
})

async function applyDesignOp(projectId: number, op: Record<string, unknown>) {
  const type = String(op.type ?? '')
  if (type === 'PAGE_UPSERT') {
    const page = op.page as Record<string, unknown> | undefined
    if (!page?.id) throw Object.assign(new Error('Page id is required.'), { status: 400 })
    const conflict = await one<AnyRow>('SELECT project_id AS projectId FROM pages WHERE id = ?', [String(page.id)])
    if (conflict && Number(conflict.projectId) !== projectId) {
      throw Object.assign(new Error('Page belongs to another design.'), { status: 403 })
    }
    await run(
      `INSERT INTO pages (id, project_id, position, name, background, duration_seconds, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE position = VALUES(position), name = VALUES(name),
       background = VALUES(background), duration_seconds = VALUES(duration_seconds), notes = VALUES(notes)`,
      [String(page.id), projectId, Number(page.position ?? 0), page.name ?? null, page.background ?? null, page.durationSeconds ?? null, page.notes ?? null],
    )
  } else if (type === 'PAGE_DELETE') {
    const pageId = String(op.pageId ?? '')
    await run('DELETE e FROM elements e JOIN pages p ON p.id = e.page_id WHERE p.id = ? AND p.project_id = ?', [pageId, projectId])
    await run('DELETE FROM pages WHERE id = ? AND project_id = ?', [pageId, projectId])
  } else if (type === 'PAGES_ORDER') {
    const order = Array.isArray(op.order) ? op.order.map(String) : []
    if (new Set(order).size !== order.length) throw Object.assign(new Error('Page order contains duplicate ids.'), { status: 400 })
    const pages = order.length
      ? await rows<AnyRow>(`SELECT id FROM pages WHERE project_id = ? AND id IN (${order.map(() => '?').join(',')})`, [projectId, ...order])
      : []
    if (pages.length !== order.length) throw Object.assign(new Error('Page order includes a page from another design.'), { status: 403 })
    for (let position = 0; position < order.length; position++) {
      await run('UPDATE pages SET position = ? WHERE id = ? AND project_id = ?', [position, order[position], projectId])
    }
  } else if (type === 'PROJECT_SIZE') {
    await run('UPDATE projects SET width = ?, height = ? WHERE id = ?', [Number(op.width), Number(op.height), projectId])
  } else if (type === 'ELEMENTS_DELETE') {
    const ids = Array.isArray(op.ids) ? op.ids.map(String) : []
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',')
      await run(`DELETE e FROM elements e JOIN pages p ON p.id = e.page_id WHERE p.project_id = ? AND e.id IN (${placeholders})`, [projectId, ...ids])
    }
  } else if (type === 'ELEMENTS_UPSERT') {
    const pageId = String(op.pageId ?? '')
    const page = await one<AnyRow>('SELECT id FROM pages WHERE id = ? AND project_id = ?', [pageId, projectId])
    if (!page) throw Object.assign(new Error('Page not found.'), { status: 404 })
    const elements = Array.isArray(op.elements) ? op.elements as Record<string, unknown>[] : []
    const ids = elements.map((element) => String(element.id ?? ''))
    if (ids.some((id) => !id || id.length > 36) || new Set(ids).size !== ids.length) {
      throw Object.assign(new Error('Element ids must be unique and no longer than 36 characters.'), { status: 400 })
    }
    if (ids.length) {
      const conflicts = await rows<AnyRow>(
        `SELECT e.id FROM elements e JOIN pages p ON p.id = e.page_id
         WHERE p.project_id <> ? AND e.id IN (${ids.map(() => '?').join(',')}) LIMIT 1`,
        [projectId, ...ids],
      )
      if (conflicts.length) throw Object.assign(new Error('An element belongs to another design.'), { status: 403 })
    }
    for (const element of elements) {
      await run(
        `INSERT INTO elements (id, page_id, type, z_index, data) VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE page_id = VALUES(page_id), type = VALUES(type), z_index = VALUES(z_index), data = VALUES(data)`,
        [String(element.id), pageId, String(element.type), Number(element.zIndex ?? 0), JSON.stringify(element.data ?? {})],
      )
    }
  } else {
    throw Object.assign(new Error(`Unknown operation ${type}.`), { status: 400 })
  }
  await run('UPDATE projects SET revision = revision + 1 WHERE id = ?', [projectId])
  const project = await one<AnyRow>('SELECT revision FROM projects WHERE id = ?', [projectId])
  return Number(project?.revision ?? 0)
}

server.on('upgrade', (request, socket, head) => {
  const origin = request.headers.origin
  if (origin && !corsOrigins.includes(origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
    socket.destroy()
    return
  }
  if (request.url?.split('?')[0] !== '/ws') {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
    socket.destroy()
    return
  }
  wss.handleUpgrade(request, socket, head, (websocket) => wss.emit('connection', websocket, request))
})

await connectDatabase()
let processingScheduledPosts = false
setInterval(async () => {
  if (processingScheduledPosts) return
  processingScheduledPosts = true
  try {
    const due = await rows<AnyRow>(
      'SELECT id FROM social_posts WHERE status = ? AND scheduled_at <= CURRENT_TIMESTAMP LIMIT 20',
      ['SCHEDULED'],
    )
    for (const post of due) {
      try {
        await publishSocialPost(Number(post.id))
      } catch (error) {
        console.error('Scheduled social post could not be published:', error)
      }
    }
  } catch (error) {
    console.error('Scheduled social posts could not be checked:', error)
  } finally {
    processingScheduledPosts = false
  }
}, 30_000).unref()
server.listen(port, () => console.log(`DesignHub Node backend listening on port ${port}`))

export { app }
