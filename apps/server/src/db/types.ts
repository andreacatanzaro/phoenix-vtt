import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/** The database as the app sees it: the same code runs on node-postgres in production and PGlite in tests. */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
