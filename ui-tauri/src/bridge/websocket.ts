import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';

let WS_URL = 'ws://127.0.0.1:27491'; // Fallback / Dev default
let socket: WebSocket | null = null;
let isConnecting = false;
let reconnectTimeout: ReturnType<typeof setTimeout>;

// Bağlantı kesildiğinde biriken mesajlar için güvenlik sınırı.
// Bu limiti aşan paketler sessizce atılır (backpressure).
const MAX_PENDING = 64;
const pendingMessages: string[] = [];

type EventPayload = Record<string, any>;
type EventHandler = (data: EventPayload) => void;

const listeners: Record<string, Set<EventHandler>> = {};
const eventHistory: Record<string, EventPayload[]> = {};

const pushEventHistory = (event: string, payload: EventPayload) => {
  const limit = event === 'log_entry' ? 500 : 12;
  const next = [...(eventHistory[event] ?? []), payload];
  eventHistory[event] = next.slice(-limit);
};

export const injectEvent = (event: string, payload: EventPayload) => {
  pushEventHistory(event, payload);
  if (listeners[event]) {
    listeners[event].forEach((handler) => handler(payload));
  }
};

export const getEventHistory = (event: string) => {
  return [...(eventHistory[event] ?? [])];
};

export const clearEventHistory = (event?: string) => {
  if (event) {
    delete eventHistory[event];
    return;
  }

  Object.keys(eventHistory).forEach((key) => {
    delete eventHistory[key];
  });
};

const flushPendingMessages = () => {
  while (pendingMessages.length > 0 && socket?.readyState === WebSocket.OPEN) {
    const message = pendingMessages.shift();
    if (message) {
      socket.send(message);
    }
  }
};

export const connect = () => {
  if (socket?.readyState === WebSocket.OPEN || isConnecting) {
    return;
  }

  isConnecting = true;
  socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    console.log(`Python Core ile baglanti kuruldu (${WS_URL}).`);
    isConnecting = false;
    clearTimeout(reconnectTimeout);
    flushPendingMessages();
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      const eventName = data.event;
      const payload = data.data ?? {};
      if (!eventName) {
        return;
      }

      pushEventHistory(eventName, payload);
      if (listeners[eventName]) {
        listeners[eventName].forEach((handler) => handler(payload));
      }
    } catch (err) {
      console.error('Gelen paket bozuk:', err);
    }
  };

  socket.onclose = () => {
    console.log('Baglanti koptu. 3 saniye icinde tekrar deneniyor...');
    socket = null;
    isConnecting = false;
    reconnectTimeout = setTimeout(connect, 3000);
  };

  socket.onerror = (err) => {
    console.error('WebSocket hatasi:', err);
    socket?.close();
  };
};

export const disconnect = () => {
  clearTimeout(reconnectTimeout);
  if (socket) {
    socket.onclose = null;
    socket.close(1000, 'ui_disconnect');
    socket = null;
  }
  isConnecting = false;
  pendingMessages.length = 0;
};

export const send = (event: string, data?: Record<string, unknown>) => {
  const message = JSON.stringify({ event, data: data ?? {} });

  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(message);
    return;
  }

  if (socket?.readyState === WebSocket.CONNECTING || isConnecting || socket === null) {
    if (pendingMessages.length >= MAX_PENDING) {
      console.warn('[WS] Pending queue dolu (%d/%d), mesaj atlandı: %s', pendingMessages.length, MAX_PENDING, event);
      return;
    }
    pendingMessages.push(message);
    return;
  }

  console.warn('Bağlantı hazır değil. Paket gönderilemedi:', event);
};

export const onEvent = (event: string, handler: EventHandler) => {
  if (!listeners[event]) {
    listeners[event] = new Set();
  }

  listeners[event].add(handler);

  return () => {
    listeners[event].delete(handler);
    if (listeners[event].size === 0) {
      delete listeners[event];
    }
  };
};

export const useWebSocket = () => {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const checkConnection = setInterval(() => {
      setIsConnected(socket?.readyState === WebSocket.OPEN);
    }, 1000);

    return () => clearInterval(checkConnection);
  }, []);

  return { send, onEvent, isConnected };
};

export const wsClient = {
  connect,
  disconnect,
  send,
  onEvent,
  getEventHistory,
  clearEventHistory,
  injectEvent,
};

// Tauri backend-ready dinleyicisi (Production Modu için Dinamik Port)
if (window.__TAURI_INTERNALS__) {
  listen<string>('backend-ready', (event) => {
    const dynamicPort = event.payload;
    console.log(`[Tauri] backend-ready eventi alindi, port: ${dynamicPort}`);
    WS_URL = `ws://127.0.0.1:${dynamicPort}`;
    if (socket) {
      disconnect();
    }
    connect();
  }).catch((err) => console.error("backend-ready dinlenirken hata:", err));
}
