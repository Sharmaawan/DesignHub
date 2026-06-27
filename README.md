# Canva Clone

A professional drag-and-drop design editor with real-time collaboration.

## Features

- User authentication (email, Google OAuth)
- Dashboard with recent projects
- Drag-and-drop canvas editor
- Text, image, shape, icon, sticker, chart, table, video elements
- Layer management
- Undo/redo history
- Zoom controls
- Multi-page designs
- Real-time collaboration
- Comments and version history
- Export to PNG, JPG, SVG, PDF, PPTX, MP4
- Dark/light mode
- Responsive design

## Project Structure

```
packages/
  backend/     # Express.js API with Prisma
  frontend/    # React + TypeScript + Vite
```

## Setup

### Backend

1. Navigate to `packages/backend`
2. Install dependencies: `npm install`
3. Set up PostgreSQL database
4. Copy `.env.example` to `.env` and configure
5. Run migrations: `npx prisma migrate dev`
6. Start server: `npm run dev`

### Frontend

1. Navigate to `packages/frontend`
2. Install dependencies: `npm install`
3. Start dev server: `npm run dev`

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS, Konva.js, Zustand, Socket.io
- **Backend**: Express.js, TypeScript, Prisma, PostgreSQL, Sharp, Socket.io
- **Real-time**: Socket.io with Redis adapter
- **Storage**: AWS S3 or local uploads