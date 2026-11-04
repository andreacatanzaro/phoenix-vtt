// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TableCommand } from "@phoenix/shared";
import { ScenesPanel } from "./ScenesPanel";
import { scene } from "./table/fixtures";
import { fakeServer } from "./test-helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const el = (id: string, name: string) => ({ id, name, description: "", revealed: true });
const tree = { regions: [{ ...el("r1", "Regno"), areas: [{ ...el("a1", "Foresta"), places: [{ ...el("p1", "Locanda"), scenes: [el("s1", "Sala comune"), el("s2", "Cantina")] }] }] }] };

function setup(current: typeof scene | null = scene, body: unknown = tree) {
  fakeServer({ "GET /api/worlds/w1/tree": [{ status: 200, body }] });
  const send = vi.fn<(command: TableCommand) => boolean>(() => true);
  render(<ScenesPanel worldId="w1" scene={current} send={send} />);
  return { send };
}

describe("ScenesPanel", () => {
  it("lists every scene with its path, and marks the one being played", async () => {
    setup();
    expect(await screen.findByText("Regno › Foresta › Locanda › Cantina")).toBeTruthy();
    expect(screen.getByText("In gioco")).toBeTruthy();
    // The scene in play has no buttons of its own: it is already open.
    expect(screen.queryByRole("button", { name: /Apri scena: .*Sala comune/ })).toBeNull();
  });

  it("opens a scene, or takes everyone there", async () => {
    const { send } = setup();
    fireEvent.click(await screen.findByRole("button", { name: /Apri scena: .*Cantina/ }));
    fireEvent.click(screen.getByRole("button", { name: /Porta tutti qui: .*Cantina/ }));
    const sent = send.mock.calls.map((c) => c[0]);
    expect(sent[0]).toMatchObject({ type: "scene.open" });
    expect(sent[1]).toMatchObject({ type: "scene.travel" });
  });

  it("cannot take anyone anywhere before a scene is open, but can open one", async () => {
    setup(null);
    const travel = await screen.findAllByRole("button", { name: /Porta tutti qui/ });
    for (const b of travel) expect(b.hasAttribute("disabled")).toBe(true);
    for (const b of screen.getAllByRole("button", { name: /Apri scena/ })) expect(b.hasAttribute("disabled")).toBe(false);
  });

  it("says so when the world has no scenes", async () => {
    setup(null, { regions: [] });
    expect(await screen.findByText("Non ci sono ancora scene in questo mondo.")).toBeTruthy();
  });

  it("shows the server's refusal in Italian", async () => {
    fakeServer({ "GET /api/worlds/w1/tree": [{ status: 500, body: { error: "errors.unavailable" } }] });
    render(<ScenesPanel worldId="w1" scene={null} send={vi.fn<(command: TableCommand) => boolean>(() => true)} />);
    expect((await screen.findByRole("alert")).textContent).toBe("Il servizio non è disponibile.");
  });
});
