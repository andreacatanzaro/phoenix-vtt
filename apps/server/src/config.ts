import { z } from "zod";

const MIN_SECRET_LENGTH = 32;

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default("0.0.0.0"),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(MIN_SECRET_LENGTH),
  /** Defaults to on in production and off otherwise, so local work over plain http still has a session. Turning it off in production is refused. */
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  /** Folder with the built client; when set, the server serves it, so the app is a single service. */
  STATIC_DIR: z.string().min(1).optional(),
  SESSION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
});

export type Config = {
  nodeEnv: "development" | "test" | "production";
  port: number;
  host: string;
  databaseUrl: string;
  sessionSecret: string;
  cookieSecure: boolean;
  sessionDays: number;
  staticDir: string | null;
};

/** Reads the configuration from environment variables only. Throws a readable error when something is missing. */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid configuration: ${problems}`);
  }
  const e = parsed.data;
  if (e.NODE_ENV === "production" && e.COOKIE_SECURE === "false") {
    throw new Error("Invalid configuration: COOKIE_SECURE=false is not allowed in production, the session cookie must be Secure");
  }
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    host: e.HOST,
    databaseUrl: e.DATABASE_URL,
    sessionSecret: e.SESSION_SECRET,
    cookieSecure: e.COOKIE_SECURE === undefined ? e.NODE_ENV === "production" : e.COOKIE_SECURE === "true",
    sessionDays: e.SESSION_DAYS,
    staticDir: e.STATIC_DIR ?? null,
  };
}
