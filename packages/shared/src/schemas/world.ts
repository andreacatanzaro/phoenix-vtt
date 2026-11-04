import { z } from "zod";
import { WORLD_ROLES } from "./auth";

export const ELEMENT_NAME_MAX_LENGTH = 120;
export const ELEMENT_TEXT_MAX_LENGTH = 5000;
export const SESSION_REPORT_MAX_LENGTH = 20000;

/** The four levels of a world, from the largest to the one that is played. */
export const ELEMENT_COLLECTIONS = ["regions", "areas", "places", "scenes"] as const;
export type ElementCollection = (typeof ELEMENT_COLLECTIONS)[number];
export const collectionSchema = z.enum(ELEMENT_COLLECTIONS);

const nameSchema = z.string().trim().min(1).max(ELEMENT_NAME_MAX_LENGTH);
const textSchema = z.string().max(ELEMENT_TEXT_MAX_LENGTH);

/** `parentId` is the region of an area, the area of a place, the place of a scene; regions have none. */
export const createElementSchema = z.object({
  name: nameSchema,
  description: textSchema.default(""),
  dmNotes: textSchema.default(""),
  parentId: z.uuid().optional(),
});
export type CreateElementInput = z.infer<typeof createElementSchema>;

export const updateElementSchema = z
  .object({ name: nameSchema, description: textSchema, dmNotes: textSchema, revealed: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0);
export type UpdateElementInput = z.infer<typeof updateElementSchema>;

/** `dmNotes` is present only in what the DM receives. */
const elementBase = { id: z.string(), name: z.string(), description: z.string(), revealed: z.boolean(), dmNotes: z.string().optional() };
export const sceneViewSchema = z.object(elementBase);
export const placeViewSchema = z.object({ ...elementBase, scenes: z.array(sceneViewSchema) });
export const areaViewSchema = z.object({ ...elementBase, places: z.array(placeViewSchema) });
export const regionViewSchema = z.object({ ...elementBase, areas: z.array(areaViewSchema) });
export const worldTreeSchema = z.object({ regions: z.array(regionViewSchema) });
export type SceneView = z.infer<typeof sceneViewSchema>;
export type PlaceView = z.infer<typeof placeViewSchema>;
export type AreaView = z.infer<typeof areaViewSchema>;
export type RegionView = z.infer<typeof regionViewSchema>;
export type WorldTree = z.infer<typeof worldTreeSchema>;

/** What creating or updating one element answers: the element without its children. */
export const elementResponseSchema = z.object({ element: z.object(elementBase) });
export type ElementView = z.infer<typeof elementResponseSchema>["element"];

export const createSceneLinkSchema = z.object({ fromSceneId: z.uuid(), toSceneId: z.uuid(), label: z.string().trim().max(ELEMENT_NAME_MAX_LENGTH).default("") });
export type CreateSceneLinkInput = z.infer<typeof createSceneLinkSchema>;
export const sceneLinkViewSchema = z.object({ id: z.string(), fromSceneId: z.string(), toSceneId: z.string(), label: z.string() });
export type SceneLinkView = z.infer<typeof sceneLinkViewSchema>;
export const sceneLinkResponseSchema = z.object({ link: sceneLinkViewSchema });
export const sceneLinksResponseSchema = z.object({ links: z.array(sceneLinkViewSchema) });

export const addMemberSchema = z.object({ username: z.string().min(1).max(64) });
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export const memberViewSchema = z.object({ accountId: z.string(), username: z.string(), role: z.enum(WORLD_ROLES) });
export type MemberView = z.infer<typeof memberViewSchema>;
export const memberResponseSchema = z.object({ member: memberViewSchema });
export const membersResponseSchema = z.object({ members: z.array(memberViewSchema) });

export const SESSION_STATUSES = ["draft", "published", "running", "closed"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export const MAX_SESSION_SEATS = 20;

const sessionFields = {
  title: z.string().trim().min(1).max(ELEMENT_NAME_MAX_LENGTH),
  scheduledAt: z.iso.datetime().nullable(),
  recommendedLevel: z.number().int().min(1).max(20).nullable(),
  seats: z.number().int().min(1).max(MAX_SESSION_SEATS).nullable(),
};
export const createSessionSchema = z.object({ title: sessionFields.title, scheduledAt: sessionFields.scheduledAt.default(null), recommendedLevel: sessionFields.recommendedLevel.default(null), seats: sessionFields.seats.default(null) });
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export const updateSessionSchema = z.object(sessionFields).partial().refine((v) => Object.keys(v).length > 0);
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
export const closeSessionSchema = z.object({ report: z.string().max(SESSION_REPORT_MAX_LENGTH).default("") });
export const reportSchema = z.object({ report: z.string().max(SESSION_REPORT_MAX_LENGTH) });

export const sessionViewSchema = z.object({
  id: z.string(),
  title: z.string(),
  scheduledAt: z.string().nullable(),
  recommendedLevel: z.number().nullable(),
  seats: z.number().nullable(),
  status: z.enum(SESSION_STATUSES),
  report: z.string(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
});
export type SessionView = z.infer<typeof sessionViewSchema>;
export const sessionResponseSchema = z.object({ session: sessionViewSchema });
export const sessionsResponseSchema = z.object({ sessions: z.array(sessionViewSchema) });
