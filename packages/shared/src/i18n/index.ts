import { it } from "./it";

type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Every dotted key that points to a text. A key that is not in the catalog does not compile. */
export type MessageKey = Leaves<typeof it>;

export type MessageParams = Record<string, string | number | boolean>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function flatten(node: unknown, prefix: string, out: Map<string, string>): void {
  if (typeof node === "string") {
    out.set(prefix, node);
    return;
  }
  if (!isRecord(node)) return;
  for (const [key, child] of Object.entries(node)) {
    flatten(child, prefix === "" ? key : `${prefix}.${key}`, out);
  }
}

const messages = new Map<string, string>();
flatten(it, "", messages);

export function messageKeys(): string[] {
  return [...messages.keys()];
}

export function isMessageKey(key: string): key is MessageKey {
  return messages.has(key);
}

/**
 * Renders a key that may come from outside the type system (e.g. a log line from the engine).
 * Throws on unknown keys and missing parameters. `lenient` returns the raw template instead of filling it.
 */
export function translate(key: string, params?: MessageParams, options: { lenient?: boolean } = {}): string {
  const template = messages.get(key);
  if (template === undefined) throw new Error(`Unknown message key: ${key}`);
  if (options.lenient === true) return template;
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (_match, name: string) => {
    const value = params?.[name];
    if (value === undefined) throw new Error(`Missing parameter "${name}" for ${key}`);
    return String(value);
  });
}

/** Typed variant for keys written in code. */
export function t(key: MessageKey, params?: MessageParams): string {
  return translate(key, params);
}

/** Structural twin of rules-core's `LogLine`: `shared` cannot import the engine. */
export type RenderableLogLine = {
  key: string;
  params: MessageParams;
  refs?: Record<string, "text-key" | "actor-id">;
};

/**
 * Turns a log line from the engine into Italian text. Params marked in `refs` are resolved first:
 * "text-key" through the catalog, "actor-id" through `actorName`.
 */
export function renderLogLine(line: RenderableLogLine, actorName: (actorId: string) => string): string {
  const resolved: MessageParams = { ...line.params };
  for (const [name, kind] of Object.entries(line.refs ?? {})) {
    const raw = line.params[name];
    if (typeof raw !== "string") throw new Error(`Param "${name}" of ${line.key} must be a string reference`);
    resolved[name] = kind === "text-key" ? translate(raw) : actorName(raw);
  }
  return translate(line.key, resolved);
}

export { it } from "./it";
