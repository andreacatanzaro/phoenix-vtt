import { z } from "zod";
import {
  accountResponseSchema,
  apiErrorSchema,
  worldResponseSchema,
  worldsResponseSchema,
  type AccountView,
  type LoginInput,
  type RegisterInput,
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
};
