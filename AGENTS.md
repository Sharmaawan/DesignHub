# Canva Clone Development

## Scripts

- Frontend development: `npm run dev --workspace=packages/frontend`
- Backend development: `npm run dev --workspace=packages/backend`
- Type checking: `npm run typecheck`
- Linting: `npm run lint`
- Build all: `npm run build`

## Architecture

### Frontend (`/packages/frontend`)
- React + TypeScript + Vite
- State: Zustand (authStore, editorStore, assetStore)
- Canvas: Konva.js for drag-and-drop editing
- Real-time: Socket.io client

### Backend (`/packages/backend`)
- Express.js + TypeScript
- Database: PostgreSQL with Prisma ORM
- Image processing: Sharp
- Real-time: Socket.io with Redis
- Authentication: JWT

## API Endpoints

- `/api/auth/*` - Authentication
- `/api/projects/*` - Project CRUD
- `/api/upload/*` - File upload
- `/api/export/*` - Export designs
- `/api/collaboration/*` - Comments & versions