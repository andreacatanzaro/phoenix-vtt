// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SceneControls } from "./SceneControls";
import { scene } from "./table/fixtures";
import { buttonNamed, fakeServer, inputLabelled } from "./test-helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const setupBody = { scene: { mapImageId: null, mapWidth: null, mapHeight: null, gridPx: 70, gridOffsetX: 5, gridOffsetY: 6, start: { x: 2, y: 2, w: 3, h: 2 } } };

function setup(over: Partial<Parameters<typeof SceneControls>[0]> = {}, routes: Record<string, { status: number; body?: unknown }[]> = {}) {
  const server = fakeServer({ "GET /api/worlds/w1/scenes/s1/table": [{ status: 200, body: setupBody }], ...routes });
  const handlers = { onShowStart: vi.fn(), onSetView: vi.fn(), onResetView: vi.fn(), onSyncView: vi.fn(), onAlign: vi.fn() };
  render(<SceneControls worldId="w1" scene={scene} isDm showStart={false} view={{ x: 700, y: 420, zoom: 1.5 }} {...handlers} {...over} />);
  return { server, ...handlers };
}

describe("SceneControls when the scene changes under it", () => {
  const handlers = () => ({ onShowStart: vi.fn(), onSetView: vi.fn(), onResetView: vi.fn(), onSyncView: vi.fn(), onAlign: vi.fn() });
  const controls = (over: Partial<typeof scene>, h: ReturnType<typeof handlers>) => <SceneControls worldId="w1" scene={{ ...scene, ...over }} isDm showStart={false} view={null} {...h} />;

  it("shows a start zone drawn on the map, and saving the grid does not bring the old one back", async () => {
    const server = fakeServer({ "GET /api/worlds/w1/scenes/s1/table": [{ status: 200, body: setupBody }], "PATCH /api/worlds/w1/scenes/s1/table": [{ status: 200, body: setupBody }] });
    const h = handlers();
    const { rerender } = render(controls({}, h));
    await waitFor(() => { expect(inputLabelled("Colonna").value).toBe("2"); });
    rerender(controls({ start: { x: 5, y: 6, w: 7, h: 8 } }, h));
    await waitFor(() => { expect(inputLabelled("Colonna").value).toBe("5"); });
    expect(inputLabelled("Riga").value).toBe("6");
    expect(inputLabelled("Larghezza").value).toBe("7");
    expect(inputLabelled("Altezza").value).toBe("8");
    fireEvent.change(inputLabelled("Lato del quadretto in pixel"), { target: { value: "90" } });
    fireEvent.click(buttonNamed("Salva mappa e griglia"));
    await screen.findByText("Salvato.");
    expect(server.bodies["PATCH /api/worlds/w1/scenes/s1/table"]).toEqual([{ gridPx: 90, gridOffsetX: 5, gridOffsetY: 6, start: { x: 5, y: 6, w: 7, h: 8 } }]);
  });

  it("keeps what was typed in the grid when only the start zone changes", async () => {
    fakeServer({ "GET /api/worlds/w1/scenes/s1/table": [{ status: 200, body: setupBody }] });
    const h = handlers();
    const { rerender } = render(controls({}, h));
    await waitFor(() => { expect(inputLabelled("Lato del quadretto in pixel").value).toBe("70"); });
    fireEvent.change(inputLabelled("Lato del quadretto in pixel"), { target: { value: "88" } });
    rerender(controls({ start: { x: 5, y: 6, w: 7, h: 8 } }, h));
    await waitFor(() => { expect(inputLabelled("Colonna").value).toBe("5"); });
    expect(inputLabelled("Lato del quadretto in pixel").value).toBe("88");
  });
});

describe("SceneControls while preparing", () => {
  it("has no 'bring everyone to my view', since nobody else is there", async () => {
    setup({ preparing: true });
    await waitFor(() => { expect(inputLabelled("Spostamento orizzontale").value).toBe("5"); });
    expect(screen.queryByRole("button", { name: "Porta tutti alla mia vista" })).toBeNull();
    expect(screen.getByRole("button", { name: "Ripristina la vista" })).toBeTruthy();
  });
});

describe("a grid with decimals", () => {
  it("is shown and typed in as it is, since aligning a map gives decimals", async () => {
    setup({}, { "GET /api/worlds/w1/scenes/s1/table": [{ status: 200, body: { scene: { ...setupBody.scene, gridPx: 79.4, gridOffsetX: 5.6, gridOffsetY: 33.1 } } }] });
    await waitFor(() => { expect(inputLabelled("Spostamento orizzontale").value).toBe("5.6"); });
    expect(inputLabelled("Lato del quadretto in pixel").value).toBe("79.4");
    for (const label of ["Lato del quadretto in pixel", "Spostamento orizzontale", "Spostamento verticale"]) expect(inputLabelled(label).step).toBe("any");
  });
});

describe("aligning the map", () => {
  const withMap = { ...scene, mapImageId: "img1", mapWidth: 1400, mapHeight: 900 };

  it("offers to align the map to the grid, and starts it", async () => {
    const { onAlign } = setup({ scene: withMap });
    await waitFor(() => { expect(inputLabelled("Spostamento orizzontale").value).toBe("5"); });
    fireEvent.click(buttonNamed("Allinea la mappa alla griglia"));
    expect(onAlign).toHaveBeenCalledTimes(1);
  });

  it("does not offer it before the scene has a map", async () => {
    setup();
    await waitFor(() => { expect(inputLabelled("Spostamento orizzontale").value).toBe("5"); });
    expect(screen.queryByRole("button", { name: "Allinea la mappa alla griglia" })).toBeNull();
  });

  it("does not offer it to a player", () => {
    setup({ scene: withMap, isDm: false });
    expect(screen.queryByRole("button", { name: "Allinea la mappa alla griglia" })).toBeNull();
  });
});

describe("SceneControls as the DM", () => {
  it("says how big a square is, and loads the setup of the scene", async () => {
    setup();
    expect(await screen.findByText("Scacchiera (D&D 5e): un quadretto è 1,5 m")).toBeTruthy();
    await waitFor(() => { expect(inputLabelled("Spostamento orizzontale").value).toBe("5"); });
    expect(inputLabelled("Lato del quadretto in pixel").value).toBe("70");
  });

  it("saves what the DM changes", async () => {
    const { server } = setup({}, { "PATCH /api/worlds/w1/scenes/s1/table": [{ status: 200, body: setupBody }] });
    await waitFor(() => { expect(inputLabelled("Spostamento orizzontale").value).toBe("5"); });
    fireEvent.change(inputLabelled("Lato del quadretto in pixel"), { target: { value: "90" } });
    fireEvent.change(inputLabelled("Larghezza"), { target: { value: "4" } });
    fireEvent.click(buttonNamed("Salva mappa e griglia"));
    expect(await screen.findByText("Salvato.")).toBeTruthy();
    expect(server.bodies["PATCH /api/worlds/w1/scenes/s1/table"]).toEqual([{ gridPx: 90, gridOffsetX: 5, gridOffsetY: 6, start: { x: 2, y: 2, w: 4, h: 2 } }]);
  });

  it("forgets the 'saved' note as soon as something changes again", async () => {
    setup({}, { "PATCH /api/worlds/w1/scenes/s1/table": [{ status: 200, body: setupBody }] });
    await waitFor(() => { expect(inputLabelled("Spostamento orizzontale").value).toBe("5"); });
    fireEvent.click(buttonNamed("Salva mappa e griglia"));
    await screen.findByText("Salvato.");
    fireEvent.change(inputLabelled("Altezza"), { target: { value: "3" } });
    expect(screen.queryByText("Salvato.")).toBeNull();
  });

  it("shows the server's refusal, in Italian, and does not say it was saved", async () => {
    setup({}, { "PATCH /api/worlds/w1/scenes/s1/table": [{ status: 400, body: { error: "errors.invalid" } }] });
    await waitFor(() => { expect(inputLabelled("Spostamento orizzontale").value).toBe("5"); });
    fireEvent.click(buttonNamed("Salva mappa e griglia"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Salvato.")).toBeNull();
  });

  it("uploads a map and attaches it to the scene", async () => {
    const mapId = "22222222-2222-4222-8222-222222222222";
    const { server } = setup({}, {
      "POST /api/worlds/w1/images?kind=map": [{ status: 201, body: { image: { id: mapId, kind: "map", width: 1400, height: 840 } } }],
      "PATCH /api/worlds/w1/scenes/s1/table": [{ status: 200, body: setupBody }],
    });
    fireEvent.change(await screen.findByLabelText("Carica la mappa (PNG, JPEG o WebP)"), { target: { files: [new File([new Uint8Array([1])], "mappa.png", { type: "image/png" })] } });
    await waitFor(() => { expect(server.bodies["PATCH /api/worlds/w1/scenes/s1/table"]).toEqual([{ mapImageId: mapId }]); });
  });

  it("turns the start zone on the map on and off", async () => {
    const { onShowStart } = setup();
    fireEvent.click(await screen.findByLabelText("Mostra la zona di partenza sulla mappa"));
    expect(onShowStart).toHaveBeenCalledWith(true);
  });

  it("says which map the scene has", async () => {
    setup({ scene: { ...scene, mapImageId: "abc" } });
    expect(await screen.findByText("Mappa caricata")).toBeTruthy();
    cleanup();
    setup();
    expect(await screen.findByText("Nessuna mappa: la scena mostra solo la griglia.")).toBeTruthy();
  });
});

describe("saving while the form changes", () => {
  /** A server whose answer to the save is held until `release()`. */
  function slowSave() {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_path: string, init?: RequestInit) => {
        if (init?.method === "PATCH") await held;
        return new Response(JSON.stringify(setupBody), { status: 200 });
      }),
    );
    return release;
  }

  it("a change made while the save is under way is not reported as saved", async () => {
    const release = slowSave();
    render(<SceneControls worldId="w1" scene={scene} isDm showStart={false} view={null} onShowStart={vi.fn()} onSetView={vi.fn()} onResetView={vi.fn()} onSyncView={vi.fn()} onAlign={vi.fn()} />);
    await waitFor(() => { expect(inputLabelled("Spostamento orizzontale").value).toBe("5"); });
    fireEvent.click(buttonNamed("Salva mappa e griglia"));
    fireEvent.change(inputLabelled("Altezza"), { target: { value: "3" } });
    release();
    await waitFor(() => { expect(buttonNamed("Salva mappa e griglia").disabled).toBe(false); });
    expect(screen.queryByText("Salvato.")).toBeNull();
  });

  it("while a save is under way the button is off, and a save with nothing changed says it is saved", async () => {
    const release = slowSave();
    render(<SceneControls worldId="w1" scene={scene} isDm showStart={false} view={null} onShowStart={vi.fn()} onSetView={vi.fn()} onResetView={vi.fn()} onSyncView={vi.fn()} onAlign={vi.fn()} />);
    await waitFor(() => { expect(inputLabelled("Spostamento orizzontale").value).toBe("5"); });
    fireEvent.click(buttonNamed("Salva mappa e griglia"));
    await waitFor(() => { expect(buttonNamed("Salva mappa e griglia").disabled).toBe(true); });
    release();
    expect(await screen.findByText("Salvato.")).toBeTruthy();
    expect(buttonNamed("Salva mappa e griglia").disabled).toBe(false);
  });
});

describe("the view, for everyone", () => {
  it("shows where the view is, and moves it when a number is typed", () => {
    const { onSetView } = setup();
    expect(inputLabelled("Posizione X").value).toBe("700");
    expect(inputLabelled("Posizione Y").value).toBe("420");
    expect(inputLabelled("Zoom (%)").value).toBe("150");
    fireEvent.change(inputLabelled("Posizione X"), { target: { value: "800" } });
    expect(onSetView).toHaveBeenLastCalledWith(800, 420, 1.5);
    // The second number typed keeps the first: the board has not yet reported the new place.
    fireEvent.change(inputLabelled("Zoom (%)"), { target: { value: "200" } });
    expect(onSetView).toHaveBeenLastCalledWith(800, 420, 2);
    fireEvent.change(inputLabelled("Posizione Y"), { target: { value: "500" } });
    expect(onSetView).toHaveBeenLastCalledWith(800, 500, 2);
  });

  it("goes back to the whole board", () => {
    const { onResetView } = setup();
    fireEvent.click(buttonNamed("Ripristina la vista"));
    expect(onResetView).toHaveBeenCalled();
  });

  it("the DM can take everyone to the view", () => {
    const { onSyncView } = setup();
    fireEvent.click(buttonNamed("Porta tutti alla mia vista"));
    expect(onSyncView).toHaveBeenCalled();
  });

  it("a player has the view and nothing of the grid or the sync", () => {
    const server = fakeServer({});
    render(<SceneControls worldId="w1" scene={scene} isDm={false} showStart={false} view={{ x: 1, y: 2, zoom: 1 }} onShowStart={vi.fn()} onSetView={vi.fn()} onResetView={vi.fn()} onSyncView={vi.fn()} onAlign={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Ripristina la vista" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Porta tutti alla mia vista" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Salva mappa e griglia" })).toBeNull();
    expect(server.calls).toEqual([]);
  });

  it("with no scene there is nothing to look at", () => {
    setup({ scene: null });
    expect(screen.queryByRole("button", { name: "Ripristina la vista" })).toBeNull();
  });

  it("waits for the board to say where the view is before showing numbers", () => {
    setup({ view: null });
    expect(screen.queryByLabelText("Posizione X")).toBeNull();
    expect(screen.getByRole("button", { name: "Ripristina la vista" })).toBeTruthy();
  });
});
