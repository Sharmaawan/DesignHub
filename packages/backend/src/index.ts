import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
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

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static('uploads'));

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

app.get('/api/health', async (_, res) => {
  try {
    await prisma.$connect();
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.json({ status: 'ok', database: 'disconnected', timestamp: new Date().toISOString() });
  }
});

const collaborators = new Map<string, Map<string, { id: string; name: string; avatar: string; cursor?: { x: number; y: number } }>>();

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join-project', (projectId: string, user: { id: string; name: string; avatar: string }) => {
    socket.join(projectId);
    if (!collaborators.has(projectId)) collaborators.set(projectId, new Map());
    collaborators.get(projectId)!.set(socket.id, { ...user, id: socket.id });
    socket.to(projectId).emit('user-joined', { ...user, id: socket.id });
    socket.emit('collaborators', Array.from(collaborators.get(projectId)!.values()));
  });

  socket.on('cursor-move', (projectId: string, cursor: { x: number; y: number }) => {
    const projectCollabs = collaborators.get(projectId);
    if (projectCollabs?.has(socket.id)) {
      const collab = projectCollabs.get(socket.id)!;
      collab.cursor = cursor;
      socket.to(projectId).emit('cursor-update', { id: socket.id, cursor });
    }
  });

  socket.on('element-update', (projectId: string, data: any) => {
    socket.to(projectId).emit('element-changed', { userId: socket.id, ...data });
  });

  socket.on('chat-message', (projectId: string, message: any) => {
    io.to(projectId).emit('new-message', { ...message, userId: socket.id, timestamp: new Date().toISOString() });
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
});

export { io };
