import { io, Socket } from 'socket.io-client';

// Same "strip /api off VITE_API_URL" pattern already used everywhere else in this
// codebase (LeftSidebar.tsx, RightSidebar.tsx, PublishModal.tsx, BrandHubPage.tsx,
// UploadTemplateModal.tsx) to get the bare backend origin.
const BACKEND = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

let socket: Socket | null = null;

// One shared connection for the whole app instead of one per hook instance —
// avoids piling up duplicate sockets (and duplicate "user-joined" broadcasts)
// if useCollaboration ever mounts more than once at a time.
export function getSocket(): Socket {
  if (!socket) {
    socket = io(BACKEND, { autoConnect: true });
  }
  return socket;
}
