import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../constants/config';

export function useSocket(panelId, username, userId, onNewPost, onPostMoved, onPostDeleted, onUserJoined, onUserLeft) {
  const socketRef = useRef(null);

  useEffect(() => {
    if (!panelId || !username || !userId) return;

    // Conectar ao WebSocket
    socketRef.current = io(API_URL, {
      transports: ['websocket', 'polling'],
      timeout: 5000
    });

    const socket = socketRef.current;

    // Entrar no painel
    socket.emit('join-panel', panelId, username, userId);

    // Eventos
    socket.on('new-post', onNewPost);
    socket.on('post-moved', onPostMoved);
    socket.on('post-deleted', onPostDeleted);
    socket.on('user-joined', onUserJoined);
    socket.on('user-left', onUserLeft);

    socket.on('connect', () => {
      console.log('Socket conectado');
    });

    socket.on('disconnect', () => {
      console.log('Socket desconectado');
    });

    // Cleanup
    return () => {
      socket.emit('leave-panel', panelId, username, userId);
      socket.disconnect();
    };
  }, [panelId, username, userId, onNewPost, onPostMoved, onPostDeleted, onUserJoined, onUserLeft]);

  return socketRef.current;
}