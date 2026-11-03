import { z } from "zod";

/** Letters, digits, underscore, dot and hyphen; 3 to 32 characters. Case does not matter for uniqueness. */
export const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,32}$/;
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const WORLD_NAME_MAX_LENGTH = 80;

export const usernameSchema = z.string().regex(USERNAME_PATTERN);
export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

export const registerSchema = z.object({ username: usernameSchema, password: passwordSchema });
export type RegisterInput = z.infer<typeof registerSchema>;

/** Login does not re-check the password rules: an old password must still be able to try. */
export const loginSchema = z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(PASSWORD_MAX_LENGTH) });
export type LoginInput = z.infer<typeof loginSchema>;

export const createWorldSchema = z.object({ name: z.string().trim().min(1).max(WORLD_NAME_MAX_LENGTH) });
export type CreateWorldInput = z.infer<typeof createWorldSchema>;

export const WORLD_ROLES = ["dm", "player"] as const;
export type WorldRole = (typeof WORLD_ROLES)[number];

export const accountViewSchema = z.object({ id: z.string(), username: z.string() });
export const worldViewSchema = z.object({ id: z.string(), name: z.string(), role: z.enum(WORLD_ROLES), gameTimeMinutes: z.number() });

/** What the API sends back, so the client checks every answer instead of trusting it. The password hash never leaves the server. */
export type AccountView = z.infer<typeof accountViewSchema>;
export type WorldView = z.infer<typeof worldViewSchema>;
export const accountResponseSchema = z.object({ account: accountViewSchema });
export const worldResponseSchema = z.object({ world: worldViewSchema });
export const worldsResponseSchema = z.object({ worlds: z.array(worldViewSchema) });
/** Every API error is a catalog key under `errors.`; the client shows its Italian text. */
export const apiErrorSchema = z.object({ error: z.string() });
export type ApiError = z.infer<typeof apiErrorSchema>;
