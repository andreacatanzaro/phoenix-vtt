import { z } from "zod";
import { MAX_TOKEN_SIZE, TOKEN_COLORS, TOKEN_LABEL_MAX_LENGTH } from "./table";

/**
 * A token of the library of a world: what the DM loads once (a name, a picture, a size, a colour) and puts on scenes as
 * many times as needed. What is put on a scene is a copy, so changing or removing the library entry leaves it alone.
 */
const name = z.string().trim().min(1).max(TOKEN_LABEL_MAX_LENGTH);

export const libraryTokenInputSchema = z.object({
  name,
  color: z.enum(TOKEN_COLORS).default("gold"),
  size: z.number().int().min(1).max(MAX_TOKEN_SIZE).default(1),
  imageId: z.uuid().nullable().default(null),
});
export type LibraryTokenInput = z.infer<typeof libraryTokenInputSchema>;

export const libraryTokenUpdateSchema = z
  .object({ name, color: z.enum(TOKEN_COLORS), size: z.number().int().min(1).max(MAX_TOKEN_SIZE), imageId: z.uuid().nullable() })
  .partial()
  .refine((v) => Object.keys(v).length > 0);
export type LibraryTokenUpdate = z.infer<typeof libraryTokenUpdateSchema>;

export const libraryTokenViewSchema = z.object({ id: z.string(), name: z.string(), color: z.enum(TOKEN_COLORS), size: z.number(), imageId: z.string().nullable() });
export type LibraryTokenView = z.infer<typeof libraryTokenViewSchema>;
export const libraryTokenResponseSchema = z.object({ token: libraryTokenViewSchema });
export const libraryTokensResponseSchema = z.object({ tokens: z.array(libraryTokenViewSchema) });
