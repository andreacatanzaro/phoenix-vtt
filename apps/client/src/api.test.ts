import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiFailure, NetworkFailure, api } from "./api";
import { errorText } from "./messages";

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api", () => {
  it("me returns the account, or null when nobody is signed in", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply(200, { account: { id: "1", username: "Aldo" } })).mockResolvedValueOnce(reply(401, { error: "errors.unauthenticated" })));
    expect(await api.me()).toEqual({ id: "1", username: "Aldo" });
    expect(await api.me()).toBeNull();
  });

  it("sends JSON with the credentials of the same origin", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200, { account: { id: "1", username: "Aldo" } }));
    vi.stubGlobal("fetch", fetchMock);
    await api.login({ username: "Aldo", password: "una-password-lunga" });
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({ method: "POST", credentials: "same-origin", body: JSON.stringify({ username: "Aldo", password: "una-password-lunga" }) }));
  });

  it("turns an error answer into an ApiFailure with its catalog key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(409, { error: "errors.auth.username-taken" })));
    const failure = await api.register({ username: "Aldo", password: "una-password-lunga" }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ApiFailure);
    expect(failure).toMatchObject({ status: 409, key: "errors.auth.username-taken" });
  });

  it("does not trust an answer of the wrong shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(200, { worlds: "no" })));
    await expect(api.worlds()).rejects.toMatchObject({ key: "errors.unavailable" });
  });

  it("an answer that is not JSON at all becomes a generic failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 502 })));
    await expect(api.worlds()).rejects.toMatchObject({ status: 502, key: "errors.unavailable" });
  });

  it("an unreachable server is a NetworkFailure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("failed")));
    await expect(api.worlds()).rejects.toBeInstanceOf(NetworkFailure);
  });

  it("logout accepts an empty answer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(api.logout()).resolves.toBeUndefined();
  });
});

describe("errorText", () => {
  it("shows the Italian text for a known key, and a generic one for anything else", () => {
    expect(errorText(new ApiFailure(409, "errors.auth.username-taken"))).toBe("Questo nome utente è già in uso.");
    expect(errorText(new ApiFailure(500, "errors.chiave-inventata"))).toBe("Il servizio non è disponibile.");
    expect(errorText(new NetworkFailure("x"))).toBe("Impossibile raggiungere il server.");
    expect(errorText(new Error("boom"))).toBe("Il servizio non è disponibile.");
  });
});
