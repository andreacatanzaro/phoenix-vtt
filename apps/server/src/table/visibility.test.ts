import type { MessageView, TokenView } from "@phoenix/shared";
import { describe, expect, it } from "vitest";
import { canSeeMessage, messagesFor, tokenFor, tokensFor, type Viewer } from "./visibility";

const dm: Viewer = { accountId: "dm", username: "DM", role: "dm" };
const anna: Viewer = { accountId: "anna", username: "Anna", role: "player" };
const bruno: Viewer = { accountId: "bruno", username: "Bruno", role: "player" };

const token = (id: string, hidden: boolean): TokenView => ({ id, sceneId: "s", kind: "token", label: id, color: "gold", imageId: null, x: 0, y: 0, size: 1, hidden, travels: false, ownerAccountId: null });
const message = (over: Partial<MessageView>): MessageView => ({ id: "m", kind: "chat", audience: "all", authorId: "anna", authorName: "Anna", recipientId: null, recipientName: null, text: "ciao", notation: null, roll: null, createdAt: "2026-01-01T00:00:00.000Z", ...over });

describe("tokens", () => {
  it("the DM sees every token, hidden ones included", () => {
    expect(tokensFor(dm, [token("a", false), token("b", true)]).map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("a player never receives a hidden token", () => {
    expect(tokensFor(anna, [token("a", false), token("b", true)]).map((t) => t.id)).toEqual(["a"]);
    expect(tokenFor(anna, token("b", true))).toBeNull();
    expect(tokenFor(anna, token("a", false))?.id).toBe("a");
  });
});

describe("messages", () => {
  it("everyone reads a message for all", () => {
    for (const v of [dm, anna, bruno]) expect(canSeeMessage(v, message({}))).toBe(true);
  });

  it("a reserved roll is for the DM and whoever made it", () => {
    const reserved = message({ audience: "gm", kind: "roll", authorId: "anna" });
    expect(canSeeMessage(dm, reserved)).toBe(true);
    expect(canSeeMessage(anna, reserved)).toBe(true);
    expect(canSeeMessage(bruno, reserved)).toBe(false);
  });

  it("a whisper is for its author and its recipient only, the DM included", () => {
    const whisper = message({ audience: "whisper", authorId: "anna", recipientId: "bruno" });
    expect(canSeeMessage(anna, whisper)).toBe(true);
    expect(canSeeMessage(bruno, whisper)).toBe(true);
    expect(canSeeMessage(dm, whisper)).toBe(false);
    expect(canSeeMessage({ accountId: "carla", username: "Carla", role: "player" }, whisper)).toBe(false);
  });

  it("filters a list in order", () => {
    const list = [message({ id: "1" }), message({ id: "2", audience: "gm", authorId: "dm" }), message({ id: "3", audience: "whisper", authorId: "anna", recipientId: "bruno" })];
    expect(messagesFor(anna, list).map((m) => m.id)).toEqual(["1", "3"]);
    expect(messagesFor(dm, list).map((m) => m.id)).toEqual(["1", "2"]);
  });
});
