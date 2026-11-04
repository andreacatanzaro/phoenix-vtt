import type { ConnectionDeps, SocketLike } from "./connection";

/** A real browser WebSocket seen through the small interface the connection uses. */
export function openBrowserSocket(url: string): SocketLike {
  const ws = new WebSocket(url);
  const socket: SocketLike = {
    get readyState() {
      return ws.readyState;
    },
    send: (data) => {
      ws.send(data);
    },
    close: (code) => {
      ws.close(code);
    },
    onopen: null,
    onmessage: null,
    onclose: null,
  };
  ws.onopen = () => {
    socket.onopen?.();
  };
  ws.onmessage = (e: MessageEvent) => {
    socket.onmessage?.({ data: e.data });
  };
  ws.onclose = (e) => {
    socket.onclose?.({ code: e.code });
  };
  return socket;
}

export const browserDeps: ConnectionDeps = {
  open: openBrowserSocket,
  setTimer: (fn, ms) => window.setTimeout(fn, ms),
  clearTimer: (id) => {
    if (typeof id === "number") window.clearTimeout(id);
  },
};
