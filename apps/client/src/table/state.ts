import type { MessageView, TableEvent, TableScene, TokenView } from "@phoenix/shared";
import { movePointer, type RemotePointer } from "./pointers";

export const MAX_MESSAGES = 300;

export type Me = { accountId: string; username: string; role: "dm" | "player" };

/** What the screen knows of the table. `revision` goes up with every event, so the board can redraw after a refusal. */
export type TableState = {
  connection: "connecting" | "live" | "reconnecting" | "ended";
  me: Me | null;
  session: { id: string; title: string } | null;
  scene: TableScene | null;
  tokens: TokenView[];
  messages: MessageView[];
  present: { accountId: string; username: string }[];
  /** The catalog key of the last refusal, until the next event of another kind. */
  error: string | null;
  revision: number;
  /** Where the others are pointing, by person. */
  pointers: ReadonlyMap<string, RemotePointer>;
  /** The DM asked everyone to look here; `seq` goes up each time, so the same place can be asked twice. */
  viewRequest: { x: number; y: number; zoom: number; seq: number } | null;
};

export const initialState: TableState = { connection: "connecting", me: null, session: null, scene: null, tokens: [], messages: [], present: [], error: null, revision: 0, pointers: new Map(), viewRequest: null };

/** `at` is the moment the event arrived (ms), given by whoever receives it, so the reducer stays pure. */
export type Action = { type: "event"; event: TableEvent; at: number } | { type: "connection"; status: TableState["connection"] } | { type: "clear-error" }
  /** Redraw from what the server last said, without any new event: a token was moved by hand and the move never left. */
  | { type: "refresh" };

export function reduce(state: TableState, action: Action): TableState {
  if (action.type === "connection") return { ...state, connection: action.status, revision: state.revision + 1 };
  if (action.type === "clear-error") return { ...state, error: null };
  if (action.type === "refresh") return { ...state, revision: state.revision + 1 };
  const event = action.event;
  const next = { ...state, revision: state.revision + 1 };
  switch (event.type) {
    case "snapshot":
      return { ...next, connection: "live", me: event.you, session: event.session, scene: event.scene, tokens: event.tokens, messages: event.messages.slice(-MAX_MESSAGES), present: event.present, error: null, pointers: new Map() };
    case "token.upserted": {
      // A token of another scene is not on this board.
      if (state.scene === null || event.token.sceneId !== state.scene.id) return next;
      const known = state.tokens.some((t) => t.id === event.token.id);
      return { ...next, tokens: known ? state.tokens.map((t) => (t.id === event.token.id ? event.token : t)) : [...state.tokens, event.token] };
    }
    case "token.removed":
      return { ...next, tokens: state.tokens.filter((t) => t.id !== event.tokenId) };
    case "message":
      return { ...next, messages: [...state.messages, event.message].slice(-MAX_MESSAGES) };
    case "presence":
      return { ...next, present: event.present };
    case "error":
      return { ...next, error: event.error };
    case "pointer":
      return { ...next, pointers: movePointer(state.pointers, event, event.x, event.y, action.at) };
    case "view.sync":
      return { ...next, viewRequest: { x: event.x, y: event.y, zoom: event.zoom, seq: (state.viewRequest?.seq ?? 0) + 1 } };
    case "pong":
      return state;
  }
}
