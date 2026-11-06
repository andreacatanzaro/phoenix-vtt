// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

type Route = { status: number; body?: unknown };

/** A fake server: each call takes the next answer registered for its path. */
function fakeServer(routes: Record<string, Route[]>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((path: string, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${path}`;
      calls.push(key);
      const route = routes[key]?.shift();
      if (route === undefined) return Promise.resolve(new Response(JSON.stringify({ error: "errors.not-found" }), { status: 404 }));
      return Promise.resolve(new Response(route.body === undefined ? null : JSON.stringify(route.body), { status: route.status }));
    }),
  );
  return calls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const account = { id: "1", username: "Aldo" };

describe("App", () => {
  it("shows the login form when nobody is signed in, in Italian", async () => {
    fakeServer({ "GET /api/auth/me": [{ status: 401, body: { error: "errors.unauthenticated" } }] });
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Entra al tavolo" })).toBeTruthy();
    expect(screen.getByLabelText("Nome utente")).toBeTruthy();
  });

  it("logs in and shows the worlds of the account", async () => {
    fakeServer({
      "GET /api/auth/me": [{ status: 401, body: { error: "errors.unauthenticated" } }],
      "POST /api/auth/login": [{ status: 200, body: { account } }],
      "GET /api/worlds": [{ status: 200, body: { worlds: [{ id: "w1", name: "Phoenix", role: "dm", gameTimeMinutes: 90 }] } }],
    });
    render(<App />);
    fireEvent.change(await screen.findByLabelText("Nome utente"), { target: { value: "Aldo" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "una-password-lunga" } });
    fireEvent.click(screen.getByRole("button", { name: "Accedi" }));
    expect(await screen.findByText("Dungeon Master")).toBeTruthy();
    expect(screen.getByText("Phoenix", { selector: ".name" })).toBeTruthy();
    expect(screen.getByText("Tempo di gioco: 1 h 30 min")).toBeTruthy();
  });

  it("shows the server's error as Italian text", async () => {
    fakeServer({
      "GET /api/auth/me": [{ status: 401, body: { error: "errors.unauthenticated" } }],
      "POST /api/auth/login": [{ status: 401, body: { error: "errors.auth.invalid-credentials" } }],
    });
    render(<App />);
    fireEvent.change(await screen.findByLabelText("Nome utente"), { target: { value: "Aldo" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "sbagliata" } });
    fireEvent.click(screen.getByRole("button", { name: "Accedi" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Nome utente o password non corretti.");
  });

  it("switches to registration and back", async () => {
    fakeServer({ "GET /api/auth/me": [{ status: 401, body: { error: "errors.unauthenticated" } }] });
    render(<App />);
    fireEvent.click(await screen.findByRole("tab", { name: "Registrati" }));
    expect(screen.getByRole("tab", { name: "Registrati" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Almeno 10 caratteri.")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Accedi" }));
    expect(screen.getByRole("tab", { name: "Accedi" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByText("Almeno 10 caratteri.")).toBeNull();
  });

  it("an already signed-in account goes straight to the worlds, and can create one and sign out", async () => {
    const calls = fakeServer({
      "GET /api/auth/me": [{ status: 200, body: { account } }],
      "GET /api/worlds": [{ status: 200, body: { worlds: [] } }],
      "POST /api/worlds": [{ status: 201, body: { world: { id: "w2", name: "Nuovo", role: "dm", gameTimeMinutes: 0 } } }],
      "POST /api/auth/logout": [{ status: 204 }],
    });
    render(<App />);
    expect(await screen.findByText(/Non fai ancora parte di nessun mondo/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Nuovo mondo" }));
    fireEvent.change(screen.getByLabelText("Nome del mondo"), { target: { value: "Nuovo" } });
    fireEvent.click(screen.getByRole("button", { name: "Crea mondo" }));
    expect(await screen.findByText("Nuovo", { selector: ".name" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Esci" }));
    expect(await screen.findByRole("heading", { name: "Entra al tavolo" })).toBeTruthy();
    await waitFor(() => { expect(calls).toContain("POST /api/auth/logout"); });
  });

  it("stays signed in and says so when the server could not end the session", async () => {
    fakeServer({
      "GET /api/auth/me": [{ status: 200, body: { account } }],
      "GET /api/worlds": [{ status: 200, body: { worlds: [] } }],
      "POST /api/auth/logout": [{ status: 500, body: { error: "errors.unavailable" } }],
    });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Esci" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Il servizio non è disponibile.");
    expect(screen.getByRole("heading", { name: "I miei mondi" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Accedi" })).toBeNull();
  });

  it("an unreachable server during sign-out also keeps the user signed in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((path: string, init?: RequestInit) => {
        if (init?.method === "POST") return Promise.reject(new TypeError("failed"));
        const body = path === "/api/auth/me" ? { account } : { worlds: [] };
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
      }),
    );
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Esci" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Impossibile raggiungere il server.");
    expect(screen.getByRole("heading", { name: "I miei mondi" })).toBeTruthy();
  });

  it("drops the alert from a failed first check once the user has signed in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((path: string, init?: RequestInit) => {
        if (path === "/api/auth/me") return Promise.reject(new TypeError("failed"));
        if (init?.method === "POST") return Promise.resolve(new Response(JSON.stringify({ account }), { status: 200 }));
        return Promise.resolve(new Response(JSON.stringify({ worlds: [] }), { status: 200 }));
      }),
    );
    render(<App />);
    expect((await screen.findByRole("alert")).textContent).toBe("Impossibile raggiungere il server.");
    fireEvent.change(await screen.findByLabelText("Nome utente"), { target: { value: "Aldo" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "una-password-lunga" } });
    fireEvent.click(screen.getByRole("button", { name: "Accedi" }));
    expect(await screen.findByRole("heading", { name: "I miei mondi" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("tells the user when the server cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("failed")));
    render(<App />);
    expect((await screen.findByRole("alert")).textContent).toBe("Impossibile raggiungere il server.");
  });
});
