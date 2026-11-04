import { sql } from "drizzle-orm";
import { bigint, boolean, check, doublePrecision, jsonb, foreignKey, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const worldRole = pgEnum("world_role", ["dm", "player"]);

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull(),
  /** Lower-case form of the username: unique, so "Aldo" and "aldo" are the same account. */
  usernameKey: text("username_key").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    /** HMAC of the cookie token, never the token itself. */
    id: text("id").primaryKey(),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_account_idx").on(t.accountId)],
);

export const worlds = pgTable("worlds", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** In-game clock: whole minutes since the start of the world. */
  gameTimeMinutes: integer("game_time_minutes").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const worldMemberships = pgTable(
  "world_memberships",
  {
    worldId: uuid("world_id").notNull().references(() => worlds.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    role: worldRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.worldId, t.accountId] }),
    // One DM per world today; allowing more is a rule change, not a schema change (drop this index).
    uniqueIndex("one_dm_per_world").on(t.worldId).where(sql`${t.role} = 'dm'`),
    index("memberships_account_idx").on(t.accountId),
  ],
);

const worldRef = () => uuid("world_id").notNull().references(() => worlds.id, { onDelete: "cascade" });

/**
 * The shape shared by regions, areas, places and scenes. `revealed` decides whether players see the element (they see
 * it only if every ancestor is revealed too); `dmNotes` are never sent to players.
 */
const element = () => ({
  id: uuid("id").primaryKey().defaultRandom(),
  worldId: worldRef(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  dmNotes: text("dm_notes").notNull().default(""),
  revealed: boolean("revealed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Each child carries the world of its parent, and a composite key makes the database refuse a child in another world.
export const regions = pgTable("regions", element(), (t) => [unique("regions_id_world").on(t.id, t.worldId), index("regions_world_idx").on(t.worldId)]);

export const areas = pgTable(
  "areas",
  { ...element(), regionId: uuid("region_id").notNull() },
  (t) => [
    unique("areas_id_world").on(t.id, t.worldId),
    foreignKey({ columns: [t.regionId, t.worldId], foreignColumns: [regions.id, regions.worldId], name: "areas_region_fk" }),
    index("areas_region_idx").on(t.regionId),
  ],
);

export const places = pgTable(
  "places",
  { ...element(), areaId: uuid("area_id").notNull() },
  (t) => [
    unique("places_id_world").on(t.id, t.worldId),
    foreignKey({ columns: [t.areaId, t.worldId], foreignColumns: [areas.id, areas.worldId], name: "places_area_fk" }),
    index("places_area_idx").on(t.areaId),
  ],
);

/** An uploaded picture (a map or a token image). The bytes live in the image store, never in the database. */
export const images = pgTable(
  "images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    worldId: worldRef(),
    kind: text("kind").notNull(),
    mime: text("mime").notNull(),
    bytes: integer("bytes").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    uploadedBy: uuid("uploaded_by").references(() => accounts.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("images_world_idx").on(t.worldId), check("images_kind", sql`${t.kind} in ('map', 'token')`)],
);

export const scenes = pgTable(
  "scenes",
  {
    ...element(),
    placeId: uuid("place_id").notNull(),
    /** The map picture, the size of one grid square in picture pixels, and where the grid starts. */
    mapImageId: uuid("map_image_id").references(() => images.id, { onDelete: "set null" }),
    gridPx: doublePrecision("grid_px").notNull().default(70),
    gridOffsetX: doublePrecision("grid_offset_x").notNull().default(0),
    gridOffsetY: doublePrecision("grid_offset_y").notNull().default(0),
    /** Where tokens that travel arrive, in grid squares: a rectangle the DM places on the map. */
    startX: integer("start_x").notNull().default(0),
    startY: integer("start_y").notNull().default(0),
    startW: integer("start_w").notNull().default(4),
    startH: integer("start_h").notNull().default(4),
  },
  (t) => [
    unique("scenes_id_world").on(t.id, t.worldId),
    check("scenes_grid_px", sql`${t.gridPx} between 10 and 400`),
    check("scenes_start_zone", sql`${t.startW} between 1 and 64 and ${t.startH} between 1 and 64`),
    foreignKey({ columns: [t.placeId, t.worldId], foreignColumns: [places.id, places.worldId], name: "scenes_place_fk" }),
    index("scenes_place_idx").on(t.placeId),
  ],
);

/** A way out of a scene into another, chosen by the DM. Scenes of any place, area or region of the world can be linked. */
export const sceneLinks = pgTable(
  "scene_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    worldId: worldRef(),
    fromSceneId: uuid("from_scene_id").notNull(),
    toSceneId: uuid("to_scene_id").notNull(),
    label: text("label").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.fromSceneId, t.worldId], foreignColumns: [scenes.id, scenes.worldId], name: "scene_links_from_fk" }).onDelete("cascade"),
    foreignKey({ columns: [t.toSceneId, t.worldId], foreignColumns: [scenes.id, scenes.worldId], name: "scene_links_to_fk" }).onDelete("cascade"),
    unique("scene_links_pair").on(t.fromSceneId, t.toSceneId),
    check("scene_links_not_self", sql`${t.fromSceneId} <> ${t.toSceneId}`),
    index("scene_links_world_idx").on(t.worldId),
  ],
);

export const sessionStatus = pgEnum("game_session_status", ["draft", "published", "running", "closed"]);

/** A game session, as the DM publishes it on the board. (The login sessions of accounts are a different table.) */
export const gameSessions = pgTable(
  "game_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    worldId: worldRef(),
    title: text("title").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    recommendedLevel: integer("recommended_level"),
    seats: integer("seats"),
    status: sessionStatus("status").notNull().default("draft"),
    /** The chronicle note the DM writes at the end of the session. */
    report: text("report").notNull().default(""),
    /** The scene being played now, once the DM has opened one at the table. */
    currentSceneId: uuid("current_scene_id").references(() => scenes.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    // One session at a time is being played in a world.
    uniqueIndex("one_running_session_per_world").on(t.worldId).where(sql`${t.status} = 'running'`),
    index("game_sessions_world_idx").on(t.worldId),
    check("game_sessions_level", sql`${t.recommendedLevel} is null or (${t.recommendedLevel} between 1 and 20)`),
    check("game_sessions_seats", sql`${t.seats} is null or ${t.seats} >= 1`),
  ],
);

/** A token on a scene: where it stands (in grid squares), who moves it, and whether the players can see it. */
export const tokens = pgTable(
  "tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    worldId: worldRef(),
    sceneId: uuid("scene_id").notNull(),
    /** A figure on the board ("token") or a line of text written on the map ("text"). */
    kind: text("kind").notNull().default("token"),
    label: text("label").notNull(),
    color: text("color").notNull().default("gold"),
    imageId: uuid("image_id").references(() => images.id, { onDelete: "set null" }),
    x: integer("x").notNull().default(0),
    y: integer("y").notNull().default(0),
    size: integer("size").notNull().default(1),
    hidden: boolean("hidden").notNull().default(false),
    /** Moves with the party when the DM takes everyone to another scene. */
    travels: boolean("travels").notNull().default(false),
    ownerAccountId: uuid("owner_account_id").references(() => accounts.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.sceneId, t.worldId], foreignColumns: [scenes.id, scenes.worldId], name: "tokens_scene_fk" }).onDelete("cascade"),
    index("tokens_scene_idx").on(t.sceneId),
    check("tokens_size", sql`${t.size} between 1 and 8`),
    check("tokens_kind", sql`${t.kind} in ('token', 'text')`),
    check("tokens_position", sql`${t.x} between -1000 and 1000 and ${t.y} between -1000 and 1000`),
  ],
);

/** The log of a session: chat, dice rolls and system lines. `audience` says who may read each line. */
export const tableMessages = pgTable(
  "table_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // The order of the log: timestamps can tie when two lines arrive in the same millisecond.
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity(),
    worldId: worldRef(),
    gameSessionId: uuid("game_session_id").notNull().references(() => gameSessions.id, { onDelete: "cascade" }),
    authorAccountId: uuid("author_account_id").references(() => accounts.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    audience: text("audience").notNull().default("all"),
    recipientAccountId: uuid("recipient_account_id").references(() => accounts.id, { onDelete: "set null" }),
    text: text("text").notNull().default(""),
    notation: text("notation"),
    roll: jsonb("roll"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("table_messages_session_idx").on(t.gameSessionId, t.seq),
    check("table_messages_kind", sql`${t.kind} in ('chat', 'roll', 'system')`),
    check("table_messages_audience", sql`${t.audience} in ('all', 'gm', 'whisper')`),
  ],
);
