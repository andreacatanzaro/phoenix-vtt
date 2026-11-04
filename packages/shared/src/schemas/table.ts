import { z } from "zod";
import { WORLD_ROLES } from "./auth";

/** Limits of uploaded pictures. Checked by the server on the bytes, not on what the client says. */
export const MAX_MAP_BYTES = 10 * 1024 * 1024;
export const MAX_TOKEN_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_MAP_SIDE = 8192;
export const MAX_TOKEN_IMAGE_SIDE = 1024;
export const IMAGE_KINDS = ["map", "token"] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];
export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export const imageViewSchema = z.object({ id: z.string(), kind: z.enum(IMAGE_KINDS), width: z.number(), height: z.number() });
export type ImageView = z.infer<typeof imageViewSchema>;
export const imageResponseSchema = z.object({ image: imageViewSchema });

export const MIN_GRID_PX = 10;
export const MAX_GRID_PX = 400;
export const MAX_START_SIDE = 64;
/** The start zone stays well inside the coordinates a token may have, so tokens placed after it still fit. */
export const MAX_START_COORDINATE = 500;

/** What the DM sets on a scene so it can be played: its map, its grid and where travelling tokens arrive. */
export const sceneTableSchema = z
  .object({
    mapImageId: z.uuid().nullable(),
    // Decimals are allowed: aligning a map corrects a drift over many squares, which whole pixels cannot do.
    gridPx: z.number().min(MIN_GRID_PX).max(MAX_GRID_PX),
    gridOffsetX: z.number().min(-4000).max(4000),
    gridOffsetY: z.number().min(-4000).max(4000),
    start: z.object({ x: z.number().int().min(-MAX_START_COORDINATE).max(MAX_START_COORDINATE), y: z.number().int().min(-MAX_START_COORDINATE).max(MAX_START_COORDINATE), w: z.number().int().min(1).max(MAX_START_SIDE), h: z.number().int().min(1).max(MAX_START_SIDE) }),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0);
export type SceneTableInput = z.infer<typeof sceneTableSchema>;

export const sceneTableViewSchema = z.object({
  mapImageId: z.string().nullable(),
  mapWidth: z.number().nullable(),
  mapHeight: z.number().nullable(),
  gridPx: z.number(),
  gridOffsetX: z.number(),
  gridOffsetY: z.number(),
  start: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
});
export type SceneTableView = z.infer<typeof sceneTableViewSchema>;
export const sceneTableResponseSchema = z.object({ scene: sceneTableViewSchema });

/** Token colors, by name; the client maps each to the design palette. */
export const TOKEN_COLORS = ["gold", "green", "red", "blue", "violet", "grey", "white", "black"] as const;
export type TokenColor = (typeof TOKEN_COLORS)[number];
export const TOKEN_LABEL_MAX_LENGTH = 40;
/** A piece of text written on the map. */
export const TEXT_MAX_LENGTH = 200;
/** What a token is on the board: a figure (circle with a name) or a line of text. */
export const TOKEN_KINDS = ["token", "text"] as const;
export type TokenKind = (typeof TOKEN_KINDS)[number];
export const MAX_TOKEN_SIZE = 8;
export const MAX_COORDINATE = 1000;

export const tokenViewSchema = z.object({
  id: z.string(),
  sceneId: z.string(),
  kind: z.enum(TOKEN_KINDS),
  label: z.string(),
  color: z.enum(TOKEN_COLORS),
  imageId: z.string().nullable(),
  x: z.number(),
  y: z.number(),
  size: z.number(),
  /** Present only for the DM, who sees hidden tokens; a player never receives one. */
  hidden: z.boolean(),
  travels: z.boolean(),
  ownerAccountId: z.string().nullable(),
});
export type TokenView = z.infer<typeof tokenViewSchema>;

export const MESSAGE_TEXT_MAX_LENGTH = 2000;
export const MESSAGE_KINDS = ["chat", "roll", "system"] as const;
export const MESSAGE_AUDIENCES = ["all", "gm", "whisper"] as const;

export const rollResultSchema = z.object({ dice: z.array(z.number()), kept: z.array(z.number()), modifier: z.number(), total: z.number() });
export type RollResultView = z.infer<typeof rollResultSchema>;

export const messageViewSchema = z.object({
  id: z.string(),
  kind: z.enum(MESSAGE_KINDS),
  audience: z.enum(MESSAGE_AUDIENCES),
  authorId: z.string().nullable(),
  authorName: z.string(),
  recipientId: z.string().nullable(),
  recipientName: z.string().nullable(),
  text: z.string(),
  notation: z.string().nullable(),
  roll: rollResultSchema.nullable(),
  createdAt: z.string(),
});
export type MessageView = z.infer<typeof messageViewSchema>;

export const tableSceneSchema = z.object({
  id: z.string(),
  name: z.string(),
  mapImageId: z.string().nullable(),
  mapWidth: z.number().nullable(),
  mapHeight: z.number().nullable(),
  gridPx: z.number(),
  gridOffsetX: z.number(),
  gridOffsetY: z.number(),
  start: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
});
export type TableScene = z.infer<typeof tableSceneSchema>;

export const presenceSchema = z.object({ accountId: z.string(), username: z.string() });

// ---- what the client sends ----

const coordinate = z.number().int().min(-MAX_COORDINATE).max(MAX_COORDINATE);
const label = z.string().trim().min(1).max(TEXT_MAX_LENGTH);
/** A name is short, a text may be long: the limit depends on what it is. */
const fitsKind = (kind: TokenKind, text: string): boolean => text.length <= (kind === "text" ? TEXT_MAX_LENGTH : TOKEN_LABEL_MAX_LENGTH);
/** Where the pointer or the camera is, in pixels of the scene (not squares): a free position. */
const scenePixel = z.number().min(-100000).max(100000);

export const tableCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("token.move"), tokenId: z.uuid(), x: coordinate, y: coordinate }),
  z
    .object({
      type: z.literal("token.add"),
      kind: z.enum(TOKEN_KINDS).default("token"),
      label,
      color: z.enum(TOKEN_COLORS).default("gold"),
      x: coordinate,
      y: coordinate,
      size: z.number().int().min(1).max(MAX_TOKEN_SIZE).default(1),
      hidden: z.boolean().default(false),
      travels: z.boolean().default(false),
      ownerAccountId: z.uuid().nullable().default(null),
      imageId: z.uuid().nullable().default(null),
    })
    .refine((v) => fitsKind(v.kind, v.label)),
  z.object({
    type: z.literal("token.update"),
    tokenId: z.uuid(),
    label: label.optional(),
    color: z.enum(TOKEN_COLORS).optional(),
    size: z.number().int().min(1).max(MAX_TOKEN_SIZE).optional(),
    hidden: z.boolean().optional(),
    travels: z.boolean().optional(),
    ownerAccountId: z.uuid().nullable().optional(),
    imageId: z.uuid().nullable().optional(),
  }),
  z.object({ type: z.literal("token.remove"), tokenId: z.uuid() }),
  z.object({ type: z.literal("chat.send"), text: z.string().trim().min(1).max(MESSAGE_TEXT_MAX_LENGTH), whisperTo: z.uuid().nullable().default(null) }),
  z.object({ type: z.literal("roll.request"), notation: z.string().trim().min(1).max(60), reserved: z.boolean().default(false) }),
  z.object({ type: z.literal("scene.open"), sceneId: z.uuid() }),
  z.object({ type: z.literal("scene.travel"), toSceneId: z.uuid() }),
  /** Shows where one is pointing to the others; `null` when the pointer is put away. Never saved. */
  z.object({ type: z.literal("pointer"), x: scenePixel.nullable(), y: scenePixel.nullable() }),
  /** The DM brings everyone's view to this point of the scene, at this zoom. */
  z.object({ type: z.literal("view.sync"), x: scenePixel, y: scenePixel, zoom: z.number().min(0.05).max(10) }),
  z.object({ type: z.literal("ping") }),
]);
export type TableCommand = z.infer<typeof tableCommandSchema>;

// ---- what the server sends ----

export const tableEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("snapshot"),
    session: z.object({ id: z.string(), title: z.string() }),
    you: z.object({ accountId: z.string(), username: z.string(), role: z.enum(WORLD_ROLES) }),
    scene: tableSceneSchema.nullable(),
    tokens: z.array(tokenViewSchema),
    messages: z.array(messageViewSchema),
    present: z.array(presenceSchema),
  }),
  z.object({ type: z.literal("token.upserted"), token: tokenViewSchema }),
  z.object({ type: z.literal("token.removed"), tokenId: z.string() }),
  z.object({ type: z.literal("message"), message: messageViewSchema }),
  z.object({ type: z.literal("presence"), present: z.array(presenceSchema) }),
  /** Where someone is pointing; `x` and `y` are null when they put the pointer away. */
  z.object({ type: z.literal("pointer"), accountId: z.string(), username: z.string(), x: scenePixel.nullable(), y: scenePixel.nullable() }),
  z.object({ type: z.literal("view.sync"), x: scenePixel, y: scenePixel, zoom: z.number() }),
  z.object({ type: z.literal("error"), error: z.string() }),
  z.object({ type: z.literal("pong") }),
]);
export type TableEvent = z.infer<typeof tableEventSchema>;
