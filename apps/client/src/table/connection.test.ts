import type { TableEvent } from "@phoenix/shared";
import { describe, expect, it } from "vitest";
import { BACKOFF_MS, connectTable, END_CODE, MAX_ATTEMPTS, PING_MS, REPLACED_CODE, SIGNED_OUT_CODE, tableUrl, type SocketLike } from "./connection";

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  drop(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  receive(data: unknown): void {
    this.onmessage?.({ data });
  }
}

function harness() {
  const sockets: FakeSocket[] = [];
  const timers: { fn: () => void; ms: number; id: number; live: boolean }[] = [];
  const events: TableEvent[] = [];
  const statuses: string[] = [];
  const conn = connectTable(
    "ws://x/table",
    { onEvent: (e) => events.push(e), onStatus: (s) => statuses.push(s) },
    {
      open: () => {
        const s = new FakeSocket();
        sockets.push(s);
        return s;
      },
      setTimer: (fn, ms) => {
        const t = { fn, ms, id: timers.length, live: true };
        timers.push(t);
        return t.id;
      },
      clearTimer: (id) => {
        const t = timers.find((x) => x.id === id);
        if (t) t.live = false;
      },
    },
  );
  const fire = (): void => {
    const t = timers.filter((x) => x.live).at(-1);
    if (!t) throw new Error("no timer");
    t.live = false;
    t.fn();
  };
  return { conn, sockets, timers, events, statuses, fire };
}

describe("connectTable", () => {
  it("starts connecting and passes on valid events only", () => {
    const h = harness();
    expect(h.statuses).toEqual(["connecting"]);
    h.sockets[0]?.open();
    h.sockets[0]?.receive(JSON.stringify({ type: "pong" }));
    h.sockets[0]?.receive(JSON.stringify({ type: "teleport" }));
    h.sockets[0]?.receive("not json");
    h.sockets[0]?.receive(new ArrayBuffer(2));
    expect(h.events).toEqual([{ type: "pong" }]);
  });

  it("sends commands only while open", () => {
    const h = harness();
    expect(h.conn.send({ type: "ping" })).toBe(false);
    h.sockets[0]?.open();
    expect(h.conn.send({ type: "chat.send", text: "ciao", whisperTo: null })).toBe(true);
    expect(h.sockets[0]?.sent).toEqual([JSON.stringify({ type: "chat.send", text: "ciao", whisperTo: null })]);
  });

  it("pings to keep the line alive", () => {
    const h = harness();
    h.sockets[0]?.open();
    expect(h.timers.at(-1)?.ms).toBe(PING_MS);
    h.fire();
    expect(h.sockets[0]?.sent).toEqual([JSON.stringify({ type: "ping" })]);
  });

  it("reconnects after a drop with a growing pause, and the pause starts over once connected", () => {
    const h = harness();
    h.sockets[0]?.open();
    h.sockets[0]?.drop();
    expect(h.statuses.at(-1)).toBe("reconnecting");
    expect(h.timers.at(-1)?.ms).toBe(BACKOFF_MS[0]);
    h.fire();
    h.sockets[1]?.drop();
    expect(h.timers.at(-1)?.ms).toBe(BACKOFF_MS[1]);
    h.fire();
    h.sockets[2]?.open();
    h.sockets[2]?.drop();
    expect(h.timers.at(-1)?.ms).toBe(BACKOFF_MS[0]);
  });

  it("stops for good when the server ends the table", () => {
    const h = harness();
    h.sockets[0]?.open();
    h.sockets[0]?.drop(END_CODE);
    expect(h.statuses.at(-1)).toBe("ended");
    expect(h.timers.filter((t) => t.live)).toEqual([]);
    expect(h.sockets).toHaveLength(1);
  });

  it("stops for good when the login behind the connection is over", () => {
    const h = harness();
    h.sockets[0]?.open();
    h.sockets[0]?.drop(SIGNED_OUT_CODE);
    expect(h.statuses.at(-1)).toBe("ended");
    expect(h.sockets).toHaveLength(1);
  });

  it("stops for good when the person opened too many connections and this was the oldest", () => {
    const h = harness();
    h.sockets[0]?.open();
    h.sockets[0]?.drop(REPLACED_CODE);
    expect(h.statuses.at(-1)).toBe("ended");
    expect(h.sockets).toHaveLength(1);
  });

  it("gives up after too many failed attempts", () => {
    const h = harness();
    for (let i = 0; i <= MAX_ATTEMPTS; i++) {
      h.sockets[i]?.drop();
      if (h.statuses.at(-1) === "ended") break;
      h.fire();
    }
    expect(h.statuses.at(-1)).toBe("ended");
    expect(h.sockets.length).toBe(MAX_ATTEMPTS + 1);
  });

  it("close() ends everything and does not reconnect", () => {
    const h = harness();
    h.sockets[0]?.open();
    h.conn.close();
    expect(h.sockets[0]?.closed).toBe(true);
    h.sockets[0]?.drop();
    expect(h.sockets).toHaveLength(1);
    expect(h.statuses).not.toContain("reconnecting");
  });
});

describe("tableUrl", () => {
  it("uses wss on https and ws otherwise", () => {
    expect(tableUrl("w 1", { protocol: "https:", host: "a.b" })).toBe("wss://a.b/api/worlds/w%201/table");
    expect(tableUrl("w", { protocol: "http:", host: "localhost:5173" })).toBe("ws://localhost:5173/api/worlds/w/table");
  });

  it("is the preparation of a scene when a scene is given", () => {
    expect(tableUrl("w 1", { protocol: "https:", host: "a.b" }, "s/1")).toBe("wss://a.b/api/worlds/w%201/scenes/s%2F1/prepare");
  });
});
