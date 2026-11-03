import { sql } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
