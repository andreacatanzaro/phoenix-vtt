// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SceneTools } from "./SceneTools";
import { scene } from "./table/fixtures";
import { buttonNamed, fakeServer, inputLabelled } from "./test-helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const el = (id: string, name: string) => ({ id, name, description: "", revealed: true });
const tree = { regions: [{ ...el("r1", "Regno"), areas: [{ ...el("a1", "Foresta"), places: [{ ...el("p1", "Locanda"), scenes: [el("s1", "Sala"), el("s2", "Cantina")] }] }] }] };
const setupBody = { scene: { mapImageId: null, mapWidth: null, mapHeight: null, gridPx: 70, gridOffsetX: 5, gridOffsetY: 6, start: { x: 2, y: 2, w: 3, h: 2 } } };
const routes = () => ({
  "GET /api/worlds/w1/tree": [{ status: 200, body: tree }],
  "GET /api/worlds/w1/scenes/s1/table": [{ status: 200, body: setupBody }],
});

function setup(current: typeof scene | null = scene, extra: Record<string, { status: number; body?: unknown }[]> = {}) {
  const server = fakeServer({ ...routes(), ...extra });
  const send = vi.fn(() => true);
  const onShowStart = vi.fn();
  render(<SceneTools worldId="w1" scene={current} send={send} showStart={false} onShowStart={onShowStart} />);
  return { server, send, onShowStart };
}

/** Picks a scene in the list by (part of) its name and gives back its id. */
async function pickScene(name: string): Promise<string> {
  const option = await screen.findByRole("option", { name: new RegExp(name) });
  if (!(option instanceof HTMLOptionElement) || !(option.parentElement instanceof HTMLSelectElement)) throw new Error("not a scene option");
  fireEvent.change(option.parentElement, { target: { value: option.value } });
  return option.value;
}

describe("SceneTools", () => {
  it("lists every scene with its path and keeps the buttons off until one is picked", async () => {
    setup();
    expect(await screen.findByRole("option", { name: "Regno › Foresta › Locanda › Cantina" })).toBeTruthy();
    expect(buttonNamed("Apri scena").disabled).toBe(true);
    expect(buttonNamed("Porta tutti qui").disabled).toBe(true);
  });

  it("opens the picked scene, or takes everyone there", async () => {
    const { send } = setup();
    const cantina = await pickScene("Cantina");
    fireEvent.click(screen.getByRole("button", { name: "Apri scena" }));
    fireEvent.click(screen.getByRole("button", { name: "Porta tutti qui" }));
    expect(send).toHaveBeenNthCalledWith(1, { type: "scene.open", sceneId: cantina });
    expect(send).toHaveBeenNthCalledWith(2, { type: "scene.travel", toSceneId: cantina });
  });

  it("cannot take everyone anywhere before a scene is open, and has no map form", async () => {
    setup(null);
    await pickScene("Cantina");
    expect(buttonNamed("Porta tutti qui").disabled).toBe(true);
    expect(buttonNamed("Apri scena").disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "Salva mappa e griglia" })).toBeNull();
  });

  it("loads the setup of the scene in play and saves what the DM changes", async () => {
    const { server } = setup(scene, { "PATCH /api/worlds/w1/scenes/s1/table": [{ status: 200, body: setupBody }] });
    const grid = await screen.findByLabelText("Lato del quadretto in pixel");
    await waitFor(() => { expect(inputLabelled("Spostamento orizzontale").value).toBe("5"); });
    fireEvent.change(grid, { target: { value: "90" } });
    fireEvent.change(screen.getByLabelText("Larghezza"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva mappa e griglia" }));
    expect(await screen.findByText("Salvato.")).toBeTruthy();
    expect(server.bodies["PATCH /api/worlds/w1/scenes/s1/table"]).toEqual([{ gridPx: 90, gridOffsetX: 5, gridOffsetY: 6, start: { x: 2, y: 2, w: 4, h: 2 } }]);
  });

  it("forgets the 'saved' note as soon as something changes again", async () => {
    setup(scene, { "PATCH /api/worlds/w1/scenes/s1/table": [{ status: 200, body: setupBody }] });
    await waitFor(() => { expect(inputLabelled("Spostamento orizzontale").value).toBe("5"); });
    fireEvent.click(screen.getByRole("button", { name: "Salva mappa e griglia" }));
    await screen.findByText("Salvato.");
    fireEvent.change(screen.getByLabelText("Altezza"), { target: { value: "3" } });
    expect(screen.queryByText("Salvato.")).toBeNull();
  });

  it("shows the server's refusal, in Italian", async () => {
    setup(scene, { "PATCH /api/worlds/w1/scenes/s1/table": [{ status: 400, body: { error: "errors.invalid" } }] });
    await waitFor(() => { expect(inputLabelled("Spostamento orizzontale").value).toBe("5"); });
    fireEvent.click(screen.getByRole("button", { name: "Salva mappa e griglia" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Salvato.")).toBeNull();
  });

  it("uploads a map and attaches it to the scene", async () => {
    const mapId = "22222222-2222-4222-8222-222222222222";
    const { server } = setup(scene, {
      "POST /api/worlds/w1/images?kind=map": [{ status: 201, body: { image: { id: mapId, kind: "map", width: 1400, height: 840 } } }],
      "PATCH /api/worlds/w1/scenes/s1/table": [{ status: 200, body: setupBody }],
    });
    const input = await screen.findByLabelText("Carica la mappa (PNG, JPEG o WebP)");
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([1])], "mappa.png", { type: "image/png" })] } });
    await waitFor(() => { expect(server.bodies["PATCH /api/worlds/w1/scenes/s1/table"]).toEqual([{ mapImageId: mapId }]); });
  });

  it("turns the start zone on the map on and off", async () => {
    const { onShowStart } = setup();
    fireEvent.click(await screen.findByLabelText("Mostra la zona di partenza sulla mappa"));
    expect(onShowStart).toHaveBeenCalledWith(true);
  });

  it("says which map the scene has", async () => {
    setup({ ...scene, mapImageId: "abc" });
    expect(await screen.findByText("Mappa caricata")).toBeTruthy();
    cleanup();
    setup();
    expect(await screen.findByText("Nessuna mappa: la scena mostra solo la griglia.")).toBeTruthy();
  });
});
