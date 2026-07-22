import dotenv from 'dotenv';
// override: true — a stale machine-level OPENAI_API_KEY env var was silently
// beating the .env file's value (dotenv doesn't override existing process.env
// vars by default), so editing .env appeared to do nothing.
dotenv.config({ override: true });

import fs from 'fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import prisma from './lib/prisma';
import authRoutes from './routes/auth';
import projectRoutes from './routes/projects';
import uploadRoutes from './routes/upload';
import exportRoutes from './routes/export';
import templateRoutes from './routes/templates';
import categoryRoutes from './routes/categories';
import teamRoutes from './routes/teams';
import notificationRoutes from './routes/notifications';
import commentRoutes from './routes/comments';
import versionRoutes from './routes/versions';
import favoriteRoutes from './routes/favorites';
import collaboratorRoutes from './routes/collaborators';
import shareLinkRoutes from './routes/shareLinks';
import preferenceRoutes from './routes/preferences';
import activityRoutes from './routes/activity';
import brandRoutes from './routes/brand';
import aiSettingsRoutes from './routes/aiSettings';
import aiRoutes from './routes/ai';
import productUpdateRoutes from './routes/productUpdates';
import backgroundRemovalRoutes from './routes/backgroundRemoval';
import emailSettingsRoutes from './routes/emailSettings';
import socialRoutes from './routes/social';
import { startScheduler } from './lib/scheduler';

// uploads/ is gitignored (user content, not source) so a fresh clone/deploy never
// has it — every route that writes here (ai.ts, upload.ts) assumes it already
// exists rather than creating it, so it must exist before any of them run.
fs.mkdirSync('uploads/backgrounds', { recursive: true });

// Without these, a single uncaught error in any request handler (e.g. writing
// a response to a socket the client already closed) crashes the entire Node
// process — every other in-flight request dies with it, and PM2 has to spin
// up a fresh process before the app works again. That's what produced the
// "long wait then everything breaks until refresh" symptom: one bad AI
// generation request was taking the whole server down. Logging and staying up
// is the correct behavior for a stateless HTTP server — the alternative
// (crashing) turns one bad request into an outage for every user.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

const app = express();

// Behind a reverse proxy (nginx) the client IP arrives in X-Forwarded-For, not
// req.socket — without this express-rate-limit throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
// and would otherwise rate-limit every request under the proxy's single IP. Trust
// exactly one hop (the local nginx) rather than `true`, which would trust a
// client-spoofed header and let anyone forge their rate-limit identity.
app.set('trust proxy', 1);

const httpServer = createServer(app);
const FRONTEND_ORIGIN = process.env.FRONTEND_URL || 'http://localhost:5173';
const io = new Server(httpServer, {
  cors: {
    origin: FRONTEND_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

// crossOriginResourcePolicy relaxed to 'cross-origin' — /uploads is routinely
// loaded (as <img>/<video> src) from a frontend served on a different origin
// than this API in a typical two-service deployment.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static('uploads'));

// Generous global ceiling against abuse; a much tighter one below specifically
// guards the unauthenticated register/login/google endpoints from brute-forcing.
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

// Scope the strict limiter to ONLY the unauthenticated credential endpoints. It used
// to sit on all of /api/auth, but that namespace also holds GET /me — which the
// frontend calls on every page load to restore the session — so ordinary browsing
// exhausted the login budget and locked users out of signing in.
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts — please try again later.' },
});
app.use('/api/auth/login', credentialLimiter);
app.use('/api/auth/register', credentialLimiter);
app.use('/api/auth/google', credentialLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/versions', versionRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/collaborators', collaboratorRoutes);
app.use('/api/share-links', shareLinkRoutes);
app.use('/api/preferences', preferenceRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/brand', brandRoutes);
app.use('/api/ai-settings', aiSettingsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/product-updates', productUpdateRoutes);
app.use('/api/background-removal', backgroundRemovalRoutes);
app.use('/api/email-settings', emailSettingsRoutes);
app.use('/api/social', socialRoutes);

app.get('/api/health', async (_, res) => {
  try {
    await prisma.$connect();
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.json({ status: 'ok', database: 'disconnected', timestamp: new Date().toISOString() });
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Catches anything a route handler threw/rejected without its own try/catch —
// most routes already handle their own errors, this is the backstop.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[unhandled error]', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : (err.message || 'Internal server error'),
  });
});

const collaborators = new Map<string, Map<string, { id: string; name: string; avatar: string; color: string; cursor?: { x: number; y: number } }>>();

const CURSOR_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#FF8C00', '#98D8C8'];

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join-project', (projectId: string, user: { id: string; name: string; avatar: string }) => {
    socket.join(projectId);
    if (!collaborators.has(projectId)) collaborators.set(projectId, new Map());
    const colorIndex = collaborators.get(projectId)!.size % CURSOR_COLORS.length;
    collaborators.get(projectId)!.set(socket.id, { ...user, id: socket.id, color: CURSOR_COLORS[colorIndex] });
    socket.to(projectId).emit('user-joined', { ...user, id: socket.id, color: CURSOR_COLORS[colorIndex] });
    socket.emit('collaborators', Array.from(collaborators.get(projectId)!.values()));
  });

  socket.on('cursor-move', (projectId: string, cursor: { x: number; y: number }) => {
    const projectCollabs = collaborators.get(projectId);
    if (projectCollabs?.has(socket.id)) {
      const collab = projectCollabs.get(socket.id)!;
      collab.cursor = cursor;
      socket.to(projectId).emit('cursor-update', { id: socket.id, cursor, color: collab.color });
    }
  });

  socket.on('element-update', (projectId: string, data: any) => {
    socket.to(projectId).emit('element-changed', { userId: socket.id, ...data });
  });

  socket.on('element-add', (projectId: string, element: any) => {
    socket.to(projectId).emit('element-added', { userId: socket.id, element });
  });

  socket.on('element-delete', (projectId: string, elementId: string) => {
    socket.to(projectId).emit('element-deleted', { userId: socket.id, elementId });
  });

  socket.on('page-change', (projectId: string, pageIndex: number) => {
    socket.to(projectId).emit('page-changed', { userId: socket.id, pageIndex });
  });

  socket.on('chat-message', (projectId: string, message: any) => {
    io.to(projectId).emit('new-message', { ...message, userId: socket.id, timestamp: new Date().toISOString() });
  });

  socket.on('comment-add', (projectId: string, comment: any) => {
    socket.to(projectId).emit('comment-added', { userId: socket.id, ...comment });
  });

  socket.on('disconnect', () => {
    collaborators.forEach((users, projectId) => {
      if (users.has(socket.id)) {
        const user = users.get(socket.id);
        users.delete(socket.id);
        io.to(projectId).emit('user-left', { id: socket.id, name: user?.name });
      }
    });
    console.log(`User disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  startScheduler();
});

export { io };
