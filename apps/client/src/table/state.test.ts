import type { MessageView, TableEvent, TokenView } from "@phoenix/shared";
import { describe, expect, it } from "vitest";
import { initialState, MAX_MESSAGES, reduce, type TableState } from "./state";

const token = (id: string, over: Partial<TokenView> = {}): TokenView => ({ id, sceneId: "s1", label: id, color: "gold", imageId: null, x: 0, y: 0, size: 1, hidden: false, travels: false, ownerAccountId: null, ...over });
const message = (id: string): MessageView => ({ id, kind: "chat", audience: "all", authorId: "a", authorName: "A", recipientId: null, recipientName: null, text: id, notation: null, roll: null, createdAt: "2026-01-01T00:00:00.000Z" });
const scene = { id: "s1", name: "Sala", mapImageId: null, mapWidth: null, mapHeight: null, gridPx: 70, gridOffsetX: 0, gridOffsetY: 0, start: { x: 0, y: 0, w: 4, h: 4 } };
const snapshot = (over: Partial<Extract<TableEvent, { type: "snapshot" }>> = {}): TableEvent => ({
  type: "snapshot",
  session: { id: "x", title: "Prova" },
  you: { accountId: "me", username: "Io", role: "player" },
  scene,
  tokens: [token("a")],
  messages: [message("m1")],
  present: [{ accountId: "me", username: "Io" }],
  ...over,
});
const apply = (state: TableState, event: TableEvent): TableState => reduce(state, { type: "event", event });

describe("table state", () => {
  it("a snapshot replaces everything and makes the table live", () => {
    const s = apply({ ...initialState, tokens: [token("old")], error: "errors.table.no-exit" }, snapshot());
    expect(s).toMatchObject({ connection: "live", session: { title: "Prova" }, me: { role: "player" }, error: null });
    expect(s.tokens.map((t) => t.id)).toEqual(["a"]);
    expect(s.messages.map((m) => m.id)).toEqual(["m1"]);
  });

  it("adds a token it does not know and replaces one it does", () => {
    let s = apply(initialState, snapshot());
    s = apply(s, { type: "token.upserted", token: token("b") });
    s = apply(s, { type: "token.upserted", token: token("a", { x: 5 }) });
    expect(s.tokens.map((t) => `${t.id}${String(t.x)}`)).toEqual(["a5", "b0"]);
  });

  it("ignores a token of another scene", () => {
    const s = apply(apply(initialState, snapshot()), { type: "token.upserted", token: token("far", { sceneId: "s2" }) });
    expect(s.tokens.map((t) => t.id)).toEqual(["a"]);
  });

  it("removes a token", () => {
    const s = apply(apply(initialState, snapshot()), { type: "token.removed", tokenId: "a" });
    expect(s.tokens).toEqual([]);
  });

  it("appends messages and keeps only the last ones", () => {
    let s = apply(initialState, snapshot({ messages: [] }));
    for (let i = 0; i < MAX_MESSAGES + 5; i++) s = apply(s, { type: "message", message: message(`m${String(i)}`) });
    expect(s.messages).toHaveLength(MAX_MESSAGES);
    expect(s.messages.at(-1)?.id).toBe(`m${String(MAX_MESSAGES + 4)}`);
    expect(s.messages[0]?.id).toBe("m5");
  });

  it("updates who is present", () => {
    const s = apply(apply(initialState, snapshot()), { type: "presence", present: [] });
    expect(s.present).toEqual([]);
  });

  it("keeps a refusal until something else clears it, and always bumps the revision", () => {
    const a = apply(apply(initialState, snapshot()), { type: "error", error: "errors.table.not-your-token" });
    expect(a.error).toBe("errors.table.not-your-token");
    const b = reduce(a, { type: "clear-error" });
    expect(b.error).toBeNull();
    expect(a.revision).toBeGreaterThan(apply(initialState, snapshot()).revision);
  });

  it("a pong changes nothing", () => {
    const s = apply(initialState, snapshot());
    expect(apply(s, { type: "pong" })).toBe(s);
  });

  it("a refresh changes nothing but the revision, so the board is drawn again", () => {
    const s = apply(initialState, snapshot());
    const r = reduce(s, { type: "refresh" });
    expect(r).toEqual({ ...s, revision: s.revision + 1 });
  });

  it("follows the state of the connection", () => {
    expect(reduce(initialState, { type: "connection", status: "reconnecting" }).connection).toBe("reconnecting");
    expect(reduce(initialState, { type: "connection", status: "ended" }).connection).toBe("ended");
  });
});
