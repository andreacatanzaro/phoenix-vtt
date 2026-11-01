export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/** One readable line of the log. `key` is an i18n key, never Italian text. */
export type LogLine = {
  key: string;
  params: Record<string, string | number | boolean>;
};

export type GameEvent = {
  name: string;
  payload: JsonObject;
};

export type DecisionRequest = {
  id: string;
  to: { kind: "actor"; actorId: string } | { kind: "dm" };
  promptKey: string;
  options: { id: string; labelKey: string }[];
  /** Absolute deadline supplied by the server clock, never read by the engine. */
  expiresAt?: number;
  defaultOptionId: string;
};
