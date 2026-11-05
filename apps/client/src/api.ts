import { z } from "zod";
import {
  accountResponseSchema,
  apiErrorSchema,
  elementResponseSchema,
  imageResponseSchema,
  memberResponseSchema,
  membersResponseSchema,
  sceneLinkResponseSchema,
  sceneTableResponseSchema,
  sceneLinksResponseSchema,
  sessionResponseSchema,
  sessionsResponseSchema,
  worldResponseSchema,
  worldTreeSchema,
  worldsResponseSchema,
  type AccountView,
  type CreateSessionInput,
  type ElementCollection,
  type ElementView,
  type MapPoint,
  type ImageKind,
  type ImageView,
  type LoginInput,
  type MemberView,
  type RegisterInput,
  type SceneLinkView,
  type SceneTableInput,
  type SceneTableView,
  type SessionView,
  type UpdateElementInput,
  type UpdateSessionInput,
  type WorldTree,
  type WorldView,
} from "@phoenix/shared";

/** The server answered with an error: `key` is a catalog key (`errors.…`) the screen can translate. */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly key: string,
  ) {
    super(key);
  }
}

/** The server could not be reached at all. */
export class NetworkFailure extends Error {}

async function call<T extends z.ZodType>(method: string, path: string, schema: T, body?: unknown): Promise<z.infer<T>>;
async function call(method: string, path: string, schema: null, body?: unknown): Promise<null>;
async function call(method: string, path: string, schema: z.ZodType | null, body?: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
    });
  } catch {
    throw new NetworkFailure("network");
  }
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(await response.json().catch(() => null));
    throw new ApiFailure(response.status, parsed.success ? parsed.data.error : "errors.unavailable");
  }
  if (schema === null) return null;
  const data = schema.safeParse(await response.json().catch(() => null));
  if (!data.success) throw new ApiFailure(response.status, "errors.unavailable");
  return data.data;
}

const world = (id: string): string => `/api/worlds/${encodeURIComponent(id)}`;

/** Where the browser loads a picture of a world from (members only; the session cookie goes with it). */
export function imageUrl(worldId: string, imageId: string): string {
  return `${world(worldId)}/images/${encodeURIComponent(imageId)}`;
}

export const api = {
  async me(): Promise<AccountView | null> {
    try {
      return (await call("GET", "/api/auth/me", accountResponseSchema)).account;
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 401) return null;
      throw error;
    }
  },
  async register(input: RegisterInput): Promise<AccountView> {
    return (await call("POST", "/api/auth/register", accountResponseSchema, input)).account;
  },
  async login(input: LoginInput): Promise<AccountView> {
    return (await call("POST", "/api/auth/login", accountResponseSchema, input)).account;
  },
  async logout(): Promise<void> {
    await call("POST", "/api/auth/logout", null, {});
  },
  async worlds(): Promise<WorldView[]> {
    return (await call("GET", "/api/worlds", worldsResponseSchema)).worlds;
  },
  async createWorld(name: string): Promise<WorldView> {
    return (await call("POST", "/api/worlds", worldResponseSchema, { name })).world;
  },
  async tree(worldId: string): Promise<WorldTree> {
    return call("GET", `${world(worldId)}/tree`, worldTreeSchema);
  },
  async createElement(worldId: string, collection: ElementCollection, input: { name: string; parentId?: string; polygon?: MapPoint[]; pin?: MapPoint }): Promise<ElementView> {
    return (await call("POST", `${world(worldId)}/${collection}`, elementResponseSchema, input)).element;
  },
  async updateElement(worldId: string, collection: ElementCollection, id: string, patch: UpdateElementInput): Promise<ElementView> {
    return (await call("PATCH", `${world(worldId)}/${collection}/${encodeURIComponent(id)}`, elementResponseSchema, patch)).element;
  },
  /** `withTokens` is the DM's confirmation that a scene still holding tokens may go, with them. */
  async deleteElement(worldId: string, collection: ElementCollection, id: string, options: { withTokens?: boolean } = {}): Promise<void> {
    await call("DELETE", `${world(worldId)}/${collection}/${encodeURIComponent(id)}${options.withTokens === true ? "?withTokens=true" : ""}`, null);
  },
  async sceneLinks(worldId: string): Promise<SceneLinkView[]> {
    return (await call("GET", `${world(worldId)}/scene-links`, sceneLinksResponseSchema)).links;
  },
  async createSceneLink(worldId: string, input: { fromSceneId: string; toSceneId: string; label: string }): Promise<SceneLinkView> {
    return (await call("POST", `${world(worldId)}/scene-links`, sceneLinkResponseSchema, input)).link;
  },
  async deleteSceneLink(worldId: string, linkId: string): Promise<void> {
    await call("DELETE", `${world(worldId)}/scene-links/${encodeURIComponent(linkId)}`, null);
  },
  async members(worldId: string): Promise<MemberView[]> {
    return (await call("GET", `${world(worldId)}/members`, membersResponseSchema)).members;
  },
  async addMember(worldId: string, username: string): Promise<MemberView> {
    return (await call("POST", `${world(worldId)}/members`, memberResponseSchema, { username })).member;
  },
  async removeMember(worldId: string, accountId: string): Promise<void> {
    await call("DELETE", `${world(worldId)}/members/${encodeURIComponent(accountId)}`, null);
  },
  async sessions(worldId: string): Promise<SessionView[]> {
    return (await call("GET", `${world(worldId)}/sessions`, sessionsResponseSchema)).sessions;
  },
  async createSession(worldId: string, input: Partial<CreateSessionInput> & { title: string }): Promise<SessionView> {
    return (await call("POST", `${world(worldId)}/sessions`, sessionResponseSchema, input)).session;
  },
  async updateSession(worldId: string, sessionId: string, patch: UpdateSessionInput): Promise<SessionView> {
    return (await call("PATCH", `${world(worldId)}/sessions/${encodeURIComponent(sessionId)}`, sessionResponseSchema, patch)).session;
  },
  async sessionStep(worldId: string, sessionId: string, step: "publish" | "start" | "close", body: { report?: string } = {}): Promise<SessionView> {
    return (await call("POST", `${world(worldId)}/sessions/${encodeURIComponent(sessionId)}/${step}`, sessionResponseSchema, body)).session;
  },
  async saveReport(worldId: string, sessionId: string, report: string): Promise<SessionView> {
    return (await call("PUT", `${world(worldId)}/sessions/${encodeURIComponent(sessionId)}/report`, sessionResponseSchema, { report })).session;
  },
  async sceneTable(worldId: string, sceneId: string): Promise<SceneTableView> {
    return (await call("GET", `${world(worldId)}/scenes/${encodeURIComponent(sceneId)}/table`, sceneTableResponseSchema)).scene;
  },
  /** What the table is doing, as far as this scene goes (DM only): whether a session runs, which scene it plays, and whether it is this one. */
  async sceneContext(worldId: string, sceneId: string): Promise<{ inPlay: boolean; running: boolean; currentSceneId: string | null }> {
    const { inPlay, running, currentSceneId } = await call("GET", `${world(worldId)}/scenes/${encodeURIComponent(sceneId)}/table`, sceneTableResponseSchema);
    return { inPlay, running, currentSceneId };
  },
  /** Opens the scene at the table, for everyone (DM only, with a session running). */
  async openSceneAtTable(worldId: string, sceneId: string): Promise<void> {
    await call("POST", `${world(worldId)}/scenes/${encodeURIComponent(sceneId)}/open`, null, {});
  },
  /** Takes everyone to the scene along an exit of the scene in play (DM only). */
  async travelToScene(worldId: string, sceneId: string): Promise<void> {
    await call("POST", `${world(worldId)}/scenes/${encodeURIComponent(sceneId)}/travel`, null, {});
  },
  async updateSceneTable(worldId: string, sceneId: string, patch: SceneTableInput): Promise<SceneTableView> {
    return (await call("PATCH", `${world(worldId)}/scenes/${encodeURIComponent(sceneId)}/table`, sceneTableResponseSchema, patch)).scene;
  },
  async uploadImage(worldId: string, kind: ImageKind, file: File): Promise<ImageView> {
    let response: Response;
    try {
      response = await fetch(`${world(worldId)}/images?kind=${kind}`, { method: "POST", credentials: "same-origin", headers: { "content-type": file.type }, body: file });
    } catch {
      throw new NetworkFailure("network");
    }
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(body);
      throw new ApiFailure(response.status, parsed.success ? parsed.data.error : "errors.unavailable");
    }
    const data = imageResponseSchema.safeParse(body);
    if (!data.success) throw new ApiFailure(response.status, "errors.unavailable");
    return data.data.image;
  },
  async deleteSession(worldId: string, sessionId: string): Promise<void> {
    await call("DELETE", `${world(worldId)}/sessions/${encodeURIComponent(sessionId)}`, null);
  },
};
