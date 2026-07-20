import { io, Socket } from 'socket.io-client';

import { BACKEND_ORIGIN as BACKEND } from '../utils/api';

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
