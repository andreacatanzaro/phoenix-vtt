// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { fakeServer, pickElement } from "./test-helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const el = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, description: "", revealed: true, ...extra });
// Three scenes of one place, with no map anywhere, so they are plain elements of the list.
const tree = {
  regions: [{ ...el("r1", "Regno"), areas: [{ ...el("a1", "Foresta"), places: [{ ...el("p1", "Locanda"), scenes: [el("s1", "Sala"), el("s2", "Cantina"), el("s3", "Tetto")] }] }] }],
};

type Context = { inPlay: boolean; running: boolean; currentSceneId: string | null };
const setupBody = (context: Context) => ({ status: 200, body: { scene: { mapImageId: null, mapWidth: null, mapHeight: null, gridPx: 70, gridOffsetX: 0, gridOffsetY: 0, start: { x: 0, y: 0, w: 4, h: 4 } }, ...context } });

async function openScene(name: string, ids: { s2?: Context; s3?: Context }, extra: Record<string, { status: number; body?: unknown }[]> = {}) {
  const server = fakeServer({
    "GET /api/auth/me": [{ status: 200, body: { account: { id: "1", username: "Aldo" } } }],
    "GET /api/worlds": [{ status: 200, body: { worlds: [{ id: "w1", name: "Phoenix", role: "dm", gameTimeMinutes: 0 }] } }],
    "GET /api/worlds/w1/tree": [{ status: 200, body: tree }],
    "GET /api/worlds/w1/scene-links": [{ status: 200, body: { links: [{ id: "l1", fromSceneId: "s1", toSceneId: "s2", label: "" }] } }],
    "GET /api/worlds/w1/scenes/s2/table": [setupBody(ids.s2 ?? { inPlay: false, running: false, currentSceneId: null })],
    "GET /api/worlds/w1/scenes/s3/table": [setupBody(ids.s3 ?? { inPlay: false, running: false, currentSceneId: null })],
    ...extra,
  });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Apri Phoenix" }));
  await pickElement(name);
  return server;
}

describe("opening a scene at the table from its page", () => {
  it("offers it while a session is running and the scene is not the one in play, and asks before doing it", async () => {
    const server = await openScene("Cantina", { s2: { inPlay: false, running: true, currentSceneId: "s1" } }, { "POST /api/worlds/w1/scenes/s2/open": [{ status: 204 }] });
    fireEvent.click(await screen.findByRole("button", { name: "Apri al tavolo" }));
    const ask = screen.getByRole("alertdialog");
    expect(ask.textContent).toContain("Aprire «Cantina» al tavolo? Tutti i giocatori la vedranno subito.");
    expect(server.calls).not.toContain("POST /api/worlds/w1/scenes/s2/open");
    fireEvent.click(within(ask).getByRole("button", { name: "Conferma" }));
    expect(await screen.findByText("Scena aperta al tavolo.")).toBeTruthy();
    expect(server.calls).toContain("POST /api/worlds/w1/scenes/s2/open");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("changing one's mind does nothing", async () => {
    const server = await openScene("Cantina", { s2: { inPlay: false, running: true, currentSceneId: "s1" } });
    fireEvent.click(await screen.findByRole("button", { name: "Apri al tavolo" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Annulla" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(server.calls.filter((c) => c.startsWith("POST"))).toEqual([]);
  });

  it("is not offered without a running session, and the scene in play says it is", async () => {
    await openScene("Cantina", { s2: { inPlay: false, running: false, currentSceneId: null } });
    await screen.findByRole("button", { name: "Prepara la scena" });
    expect(screen.queryByRole("button", { name: "Apri al tavolo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Porta tutti qui" })).toBeNull();
    cleanup();
    await openScene("Cantina", { s2: { inPlay: true, running: true, currentSceneId: "s2" } });
    expect(await screen.findByText("È la scena in gioco al tavolo.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Apri al tavolo" })).toBeNull();
  });

  it("says why when the server refuses", async () => {
    await openScene("Cantina", { s2: { inPlay: false, running: true, currentSceneId: "s1" } }, { "POST /api/worlds/w1/scenes/s2/open": [{ status: 409, body: { error: "errors.table.no-session" } }] });
    fireEvent.click(await screen.findByRole("button", { name: "Apri al tavolo" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Conferma" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Non c'è nessuna sessione in corso in questo mondo.");
  });
});

describe("bringing everyone to a scene from its page", () => {
  it("is offered only where an exit from the scene in play leads to it, and asks before doing it", async () => {
    const server = await openScene("Cantina", { s2: { inPlay: false, running: true, currentSceneId: "s1" } }, { "POST /api/worlds/w1/scenes/s2/travel": [{ status: 204 }] });
    fireEvent.click(await screen.findByRole("button", { name: "Porta tutti qui" }));
    const ask = screen.getByRole("alertdialog");
    expect(ask.textContent).toContain("Portare tutti in «Cantina»?");
    fireEvent.click(within(ask).getByRole("button", { name: "Conferma" }));
    expect(await screen.findByText("Tutti sono stati portati qui.")).toBeTruthy();
    expect(server.calls).toContain("POST /api/worlds/w1/scenes/s2/travel");
  });

  it("is not offered for a scene no exit leads to", async () => {
    await openScene("Tetto", { s3: { inPlay: false, running: true, currentSceneId: "s1" } });
    await screen.findByRole("button", { name: "Apri al tavolo" });
    expect(screen.queryByRole("button", { name: "Porta tutti qui" })).toBeNull();
  });
});
