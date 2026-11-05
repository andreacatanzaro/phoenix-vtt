// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./TablePage", () => ({
  TablePage: (p: { worldId: string; prepareSceneId?: string; onLeave: () => void }) => (
    <div data-testid="table" data-scene={p.prepareSceneId ?? ""}>
      <button type="button" onClick={p.onLeave}>Esci dal mock</button>
    </div>
  ),
}));

import { App } from "./App";
import { fakeServer } from "./test-helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const el = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, description: "", revealed: true, ...extra });
const shape = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }];
const tree = { regions: [{ ...el("r1", "Regno"), areas: [{ ...el("a1", "Foresta", { polygon: shape }), places: [{ ...el("p1", "Locanda", { pin: { x: 0.5, y: 0.3 } }), scenes: [el("s1", "Sala", { pin: { x: 0.2, y: 0.2 } }), el("s2", "Cantina", { pin: { x: 0.6, y: 0.6 } })] }] }] }] };

const setup = (inPlay: boolean) => ({ status: 200, body: { scene: { mapImageId: null, mapWidth: null, mapHeight: null, gridPx: 70, gridOffsetX: 0, gridOffsetY: 0, start: { x: 0, y: 0, w: 4, h: 4 } }, inPlay } });

async function openWorld(role: "dm" | "player", table: { status: number; body?: unknown } = setup(false)) {
  const server = fakeServer({
    "GET /api/worlds/w1/scenes/s1/table": [table],
    "GET /api/auth/me": [{ status: 200, body: { account: { id: "1", username: "Aldo" } } }],
    "GET /api/worlds": [{ status: 200, body: { worlds: [{ id: "w1", name: "Phoenix", role, gameTimeMinutes: 0 }] } }],
    "GET /api/worlds/w1/tree": [{ status: 200, body: tree }],
    "GET /api/worlds/w1/scene-links": [{ status: 200, body: { links: [] } }],
  });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Apri Phoenix" }));
  const nav = await screen.findByRole("navigation", { name: "Struttura" });
  const button = (await within(nav).findByText("Sala", { selector: ".label" })).closest("button");
  if (button === null) throw new Error("no scene button");
  fireEvent.click(button);
  return server;
}

describe("opening the preparation of a scene", () => {
  it("the DM prepares a scene from its page, on the whole screen, and comes back to the structure", async () => {
    await openWorld("dm");
    fireEvent.click(await screen.findByRole("button", { name: "Prepara la scena" }));
    expect((await screen.findByTestId("table")).dataset["scene"]).toBe("s1");
    expect(screen.queryByRole("navigation", { name: "Struttura" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Esci dal mock" }));
    expect(await screen.findByRole("navigation", { name: "Struttura" })).toBeTruthy();
    expect(screen.queryByTestId("table")).toBeNull();
  });

  it("a scene that is in play is not entered: the DM is told, and stays on the structure", async () => {
    await openWorld("dm", setup(true));
    fireEvent.click(await screen.findByRole("button", { name: "Prepara la scena" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Questa scena è in gioco al tavolo: si modifica dal tavolo, non in preparazione.");
    expect(screen.queryByTestId("table")).toBeNull();
    expect(screen.getByRole("navigation", { name: "Struttura" })).toBeTruthy();
  });

  it("says so, and stays on the structure, when it cannot be asked", async () => {
    await openWorld("dm", { status: 500 });
    fireEvent.click(await screen.findByRole("button", { name: "Prepara la scena" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByTestId("table")).toBeNull();
  });

  it("a player does not have it", async () => {
    await openWorld("player");
    await screen.findByRole("heading", { name: "Sala" });
    expect(screen.queryByRole("button", { name: "Prepara la scena" })).toBeNull();
  });
});
