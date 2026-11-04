import type { MessageView, TableScene, TokenView } from "@phoenix/shared";
import type { Me } from "./state";

export const player: Me = { accountId: "anna", username: "Anna", role: "player" };
export const dm: Me = { accountId: "dm", username: "Dora", role: "dm" };
export const people = [
  { accountId: "dm", username: "Dora" },
  { accountId: "anna", username: "Anna" },
  { accountId: "bruno", username: "Bruno" },
];

export const scene: TableScene = { id: "s1", name: "Sala comune", mapImageId: null, mapWidth: null, mapHeight: null, gridPx: 70, gridOffsetX: 0, gridOffsetY: 0, start: { x: 2, y: 2, w: 3, h: 2 } };

export const token = (id: string, over: Partial<TokenView> = {}): TokenView => ({ id, sceneId: "s1", kind: "token", label: id, color: "gold", imageId: null, x: 0, y: 0, size: 1, hidden: false, travels: false, ownerAccountId: null, ...over });

export const message = (id: string, over: Partial<MessageView> = {}): MessageView => ({
  id,
  kind: "chat",
  audience: "all",
  authorId: "bruno",
  authorName: "Bruno",
  recipientId: null,
  recipientName: null,
  text: id,
  notation: null,
  roll: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});
