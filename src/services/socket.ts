import { io, Socket } from 'socket.io-client';
import { api } from './api';

export function createSocketConnection(): Socket {
  return io(api.getServerUrl(), {
    transports: ['websocket', 'polling'],
    reconnection: true,
  });
}
