// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { SceneLinkView, WorldTree } from "@phoenix/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buttonNamed, fakeServer } from "../test-helpers";
import { ElementMap } from "./ElementMap";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
// The picture takes 400 by 200 pixels, from (100, 50).
beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ left: 100, top: 50, width: 400, height: 200, right: 500, bottom: 250, x: 100, y: 50, toJSON: () => ({}) });
});

const square = [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 }, { x: 0.1, y: 0.5 }];
const el = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, description: "", revealed: true, ...extra });

/** A region with a map, an area on it with a place pinned in it, and a scene pinned on the map of the place. */
function mappedTree(): WorldTree {
  return {
    regions: [{
      ...el("r1", "Regno", { mapImageId: "m1" }),
      areas: [
        {
          ...el("a1", "Foresta", { polygon: square }),
          places: [{
            ...el("p1", "Locanda", { pin: { x: 0.3, y: 0.3 }, mapImageId: "m2" }),
            scenes: [el("s1", "Sala", { pin: { x: 0.6, y: 0.4 } }), el("s2", "Cantina")],
          }],
        },
        { ...el("a2", "Monti"), places: [] },
      ],
    }],
  };
}
const bare: WorldTree = { regions: [{ ...el("r1", "Regno", { mapImageId: null }), areas: [] }] };

type Routes = Record<string, { status: number; body?: unknown }[]>;
function setup(tree: WorldTree, collection: "regions" | "areas" | "places" | "scenes", id: string, over: { isDm?: boolean; routes?: Routes; links?: SceneLinkView[]; onChange?: () => Promise<void> } = {}) {
  const server = fakeServer({ ...(over.routes ?? {}) });
  const onPick = vi.fn();
  const onChange = vi.fn(over.onChange ?? (() => Promise.resolve()));
  render(<ElementMap worldId="w1" isDm={over.isDm ?? true} tree={tree} links={over.links ?? []} collection={collection} id={id} onPick={onPick} onChange={onChange} />);
  return { server, onPick, onChange };
}

const element = (id: string) => ({ status: 200, body: { element: { id, name: "X", description: "", revealed: false } } });
const created = (id: string) => ({ status: 201, body: { element: { id, name: "X", description: "", revealed: false } } });
const image = { status: 201, body: { image: { id: "m9", kind: "map", width: 100, height: 100 } } };
const surface = (): HTMLElement => screen.getByTestId("atlas-map");
const clickAt = (x: number, y: number): void => { fireEvent.click(surface(), { clientX: x, clientY: y }); };

describe("the map of a region", () => {
  it("shows the areas and the places on it, and picks them", () => {
    const { onPick } = setup(mappedTree(), "regions", "r1");
    fireEvent.click(screen.getByRole("button", { name: "Foresta" }));
    // A pin the DM can drag is picked on release, or with the keyboard.
    fireEvent.keyDown(screen.getByRole("button", { name: "Locanda" }), { key: "Enter" });
    expect(onPick).toHaveBeenNthCalledWith(1, "a1");
    expect(onPick).toHaveBeenNthCalledWith(2, "p1");
    expect(screen.getByRole("img", { name: "Mappa di Regno" }).getAttribute("src")).toBe("/api/worlds/w1/images/m1");
  });

  it("without a map the DM can load one, and a player sees none and nothing to do", () => {
    setup(bare, "regions", "r1");
    expect(screen.getByLabelText("Carica la mappa della regione")).toBeTruthy();
    cleanup();
    setup(bare, "regions", "r1", { isDm: false });
    expect(screen.queryByLabelText("Carica la mappa della regione")).toBeNull();
    expect(screen.queryByTestId("atlas-map")).toBeNull();
  });

  it("loading a map uploads it and puts it on the region", async () => {
    const { server, onChange } = setup(bare, "regions", "r1", { routes: { "POST /api/worlds/w1/images?kind=map": [image], "PATCH /api/worlds/w1/regions/r1": [element("r1")] } });
    fireEvent.change(screen.getByLabelText("Carica la mappa della regione"), { target: { files: [new File(["x"], "mappa.png", { type: "image/png" })] } });
    await waitFor(() => { expect(onChange).toHaveBeenCalled(); });
    expect(server.bodies["PATCH /api/worlds/w1/regions/r1"]).toEqual([{ mapImageId: "m9" }]);
  });

  it("draws an area: the points, the shape closed, a name, and the area is created with its shape and picked", async () => {
    const { server, onPick, onChange } = setup(mappedTree(), "regions", "r1", { routes: { "POST /api/worlds/w1/areas": [created("a9")] } });
    fireEvent.click(buttonNamed("Disegna un'area"));
    expect(screen.getByRole("status").textContent).toContain("Clicca sulla mappa per segnare i punti dell'area");
    clickAt(140, 70);
    clickAt(340, 70);
    clickAt(340, 190);
    fireEvent.click(buttonNamed("Chiudi la forma"));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Paludi" } });
    fireEvent.click(buttonNamed("Crea"));
    await waitFor(() => { expect(onPick).toHaveBeenCalledWith("a9"); });
    expect(server.bodies["POST /api/worlds/w1/areas"]).toEqual([{ name: "Paludi", parentId: "r1", polygon: [{ x: 0.1, y: 0.1 }, { x: 0.6, y: 0.1 }, { x: 0.6, y: 0.7 }] }]);
    expect(onChange).toHaveBeenCalled();
  });

  it("the shape that was drawn stays on the map while it waits for a name, and goes when it is given up or made", async () => {
    setup(mappedTree(), "regions", "r1", { routes: { "POST /api/worlds/w1/areas": [created("a9")] } });
    fireEvent.click(buttonNamed("Disegna un'area"));
    clickAt(140, 70);
    clickAt(340, 70);
    clickAt(340, 190);
    expect(document.querySelector(".atlas-ghost")).toBeNull();
    fireEvent.click(buttonNamed("Chiudi la forma"));
    expect(document.querySelector(".atlas-ghost")).not.toBeNull();
    fireEvent.click(buttonNamed("Annulla"));
    expect(document.querySelector(".atlas-ghost")).toBeNull();
    fireEvent.click(buttonNamed("Disegna un'area"));
    clickAt(140, 70);
    clickAt(340, 70);
    clickAt(340, 190);
    fireEvent.click(buttonNamed("Chiudi la forma"));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Paludi" } });
    fireEvent.click(buttonNamed("Crea"));
    await waitFor(() => { expect(document.querySelector(".atlas-ghost")).toBeNull(); });
  });

  it("taking the map away asks the server, and a refusal is said", async () => {
    setup(mappedTree(), "regions", "r1", { routes: { "PATCH /api/worlds/w1/regions/r1": [{ status: 409, body: { error: "errors.world.map-in-use" } }] } });
    fireEvent.click(screen.getByRole("button", { name: "Togli la mappa: Regno" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Questa mappa non si può togliere finché ci sono elementi piazzati su di essa.");
  });

  it("a player only looks: no drawing, no loading, no taking away", () => {
    setup(mappedTree(), "regions", "r1", { isDm: false });
    expect(screen.queryByRole("button", { name: "Disegna un'area" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Togli la mappa/ })).toBeNull();
    expect(screen.queryByLabelText("Cambia la mappa")).toBeNull();
    expect(screen.getByRole("button", { name: "Foresta" })).toBeTruthy();
  });
});

describe("who can change a map", () => {
  it("the map is changed or taken away on the page of the region or place that owns it, not on the pages that only show it", () => {
    setup(mappedTree(), "regions", "r1");
    expect(screen.getByLabelText("Cambia la mappa")).toBeTruthy();
    cleanup();
    setup(mappedTree(), "areas", "a1");
    expect(screen.queryByLabelText("Cambia la mappa")).toBeNull();
    expect(screen.queryByRole("button", { name: /Togli la mappa/ })).toBeNull();
    cleanup();
    setup(mappedTree(), "places", "p1");
    // The place shows the map of its region (not its own to change) and its own map (which it can change).
    expect(screen.getAllByLabelText("Cambia la mappa")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /Togli la mappa/ })).toHaveLength(1);
  });
});

describe("the map of an area", () => {
  it("shows the area on the map of its region, with its places", () => {
    setup(mappedTree(), "areas", "a1");
    expect(screen.getByRole("button", { name: "Foresta" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Locanda" })).toBeTruthy();
  });

  it("has its points moved: they are dragged on the map and the new shape is saved", async () => {
    const { server } = setup(mappedTree(), "areas", "a1", { routes: { "PATCH /api/worlds/w1/areas/a1": [element("a1")] } });
    fireEvent.click(buttonNamed("Sposta i punti"));
    expect(screen.getByRole("status").textContent).toBe("Trascina i punti per cambiare la forma dell'area.");
    const point = screen.getByRole("button", { name: "Punto 1 di Foresta" });
    const fire = (type: string, x: number, y: number): void => { point.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true })); };
    fire("pointerdown", 140, 70);
    fire("pointermove", 220, 130);
    fire("pointerup", 220, 130);
    await waitFor(() => { expect(server.bodies["PATCH /api/worlds/w1/areas/a1"]).toEqual([{ polygon: [{ x: 0.3, y: 0.4 }, square[1], square[2], square[3]] }]); });
  });

  it("a second point dragged while the first change is still being saved is not taken, so it cannot bring the first back", async () => {
    const { onChange } = setup(mappedTree(), "areas", "a1");
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const bodies: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_path: string, init?: RequestInit) => {
      if (typeof init?.body === "string") bodies.push(JSON.parse(init.body));
      await gate;
      return new Response(JSON.stringify({ element: { id: "a1", name: "X", description: "", revealed: false } }), { status: 200 });
    }));
    fireEvent.click(buttonNamed("Sposta i punti"));
    const drag = (name: string, from: [number, number], to: [number, number]): void => {
      const point = screen.getByRole("button", { name });
      const fire = (type: string, x: number, y: number): void => { point.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true })); };
      fire("pointerdown", from[0], from[1]);
      fire("pointermove", to[0], to[1]);
      fire("pointerup", to[0], to[1]);
    };
    drag("Punto 1 di Foresta", [140, 70], [220, 130]);
    await waitFor(() => { expect(bodies).toHaveLength(1); });
    expect(buttonNamed("Punto 2 di Foresta").disabled).toBe(true);
    drag("Punto 2 di Foresta", [300, 70], [320, 90]);
    expect(bodies).toHaveLength(1);
    release();
    await waitFor(() => { expect(onChange).toHaveBeenCalled(); });
    expect(bodies).toHaveLength(1);
  });

  it("the points stay locked until the tree has been read again, so a second edit is not built on the old shape", async () => {
    let refreshed: () => void = () => undefined;
    const reading = new Promise<void>((resolve) => { refreshed = resolve; });
    const { onChange } = setup(mappedTree(), "areas", "a1", { routes: { "PATCH /api/worlds/w1/areas/a1": [element("a1")] }, onChange: () => reading });
    fireEvent.click(buttonNamed("Sposta i punti"));
    const point = screen.getByRole("button", { name: "Punto 1 di Foresta" });
    const fire = (type: string, x: number, y: number): void => { point.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true })); };
    fire("pointerdown", 140, 70);
    fire("pointermove", 220, 130);
    fire("pointerup", 220, 130);
    // The change is saved, and the tree is being read again.
    await waitFor(() => { expect(onChange).toHaveBeenCalled(); });
    fireEvent.click(buttonNamed("Sposta i punti"));
    expect(buttonNamed("Punto 2 di Foresta").disabled).toBe(true);
    refreshed();
    await waitFor(() => { expect(buttonNamed("Punto 2 di Foresta").disabled).toBe(false); });
  });

  it("a shape that would leave a place outside is refused, and the refusal is said", async () => {
    setup(mappedTree(), "areas", "a1", { routes: { "PATCH /api/worlds/w1/areas/a1": [{ status: 409, body: { error: "errors.world.pins-outside" } }] } });
    fireEvent.click(buttonNamed("Sposta i punti"));
    const point = screen.getByRole("button", { name: "Punto 3 di Foresta" });
    const fire = (type: string, x: number, y: number): void => { point.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true })); };
    fire("pointerdown", 300, 150);
    fire("pointermove", 120, 70);
    fire("pointerup", 120, 70);
    expect((await screen.findByRole("alert")).textContent).toBe("La nuova forma lascerebbe fuori dei luoghi che ci sono dentro: spostali prima.");
  });

  it("an area that is not on the map has no points to move, and a player has no way to move them", () => {
    setup(mappedTree(), "areas", "a2");
    expect(screen.queryByRole("button", { name: "Sposta i punti" })).toBeNull();
    cleanup();
    setup(mappedTree(), "areas", "a1", { isDm: false });
    expect(screen.queryByRole("button", { name: "Sposta i punti" })).toBeNull();
  });

  it("is redrawn", async () => {
    const { server } = setup(mappedTree(), "areas", "a1", { routes: { "PATCH /api/worlds/w1/areas/a1": [element("a1")] } });
    fireEvent.click(buttonNamed("Ridisegna l'area"));
    clickAt(140, 70);
    clickAt(340, 70);
    clickAt(340, 190);
    fireEvent.click(buttonNamed("Chiudi la forma"));
    await waitFor(() => { expect(server.bodies["PATCH /api/worlds/w1/areas/a1"]).toEqual([{ polygon: [{ x: 0.1, y: 0.1 }, { x: 0.6, y: 0.1 }, { x: 0.6, y: 0.7 }] }]); });
  });

  it("a pin placed for a new place stays on the map while it waits for a name, and goes when that is given up", () => {
    setup(mappedTree(), "areas", "a1");
    fireEvent.click(buttonNamed("Aggiungi un luogo in quest'area"));
    expect(screen.queryByTestId("atlas-ghost-pin")).toBeNull();
    clickAt(200, 100);
    expect(screen.getByTestId("atlas-ghost-pin").getAttribute("style")).toContain("left: 25%");
    fireEvent.click(buttonNamed("Annulla"));
    expect(screen.queryByTestId("atlas-ghost-pin")).toBeNull();
  });

  it("gets a place: the pin must be inside, a click outside is refused, inside it asks the name and creates it", async () => {
    const { server, onPick } = setup(mappedTree(), "areas", "a1", { routes: { "POST /api/worlds/w1/places": [created("p9")] } });
    fireEvent.click(buttonNamed("Aggiungi un luogo in quest'area"));
    clickAt(490, 240);
    expect((await screen.findByRole("alert")).textContent).toBe("Il segnaposto deve stare dentro l'area.");
    clickAt(200, 100);
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Torre" } });
    fireEvent.click(buttonNamed("Crea"));
    await waitFor(() => { expect(onPick).toHaveBeenCalledWith("p9"); });
    expect(server.bodies["POST /api/worlds/w1/places"]).toEqual([{ name: "Torre", parentId: "a1", pin: { x: 0.25, y: 0.25 } }]);
  });

  it("one that is not on the map yet is placed by drawing it; without the map of the region it has no map section at all, since a map is not required", async () => {
    const { server } = setup(mappedTree(), "areas", "a2", { routes: { "PATCH /api/worlds/w1/areas/a2": [element("a2")] } });
    fireEvent.click(buttonNamed("Piazza sulla mappa"));
    clickAt(140, 70);
    clickAt(340, 70);
    clickAt(340, 190);
    fireEvent.click(buttonNamed("Chiudi la forma"));
    await waitFor(() => { expect(server.bodies["PATCH /api/worlds/w1/areas/a2"]).toHaveLength(1); });
    cleanup();
    const noMap: WorldTree = { regions: [{ ...el("r1", "Regno"), areas: [{ ...el("a2", "Monti"), places: [] }] }] };
    setup(noMap, "areas", "a2");
    expect(screen.queryByTestId("atlas-map")).toBeNull();
    expect(screen.queryByRole("button", { name: "Piazza sulla mappa" })).toBeNull();
    expect(screen.queryByText(/serve prima/)).toBeNull();
  });
});

describe("the maps of a place", () => {
  it("shows where it is on the map of the region, and its own map with its scenes", () => {
    setup(mappedTree(), "places", "p1");
    expect(screen.getAllByRole("img").map((i) => i.getAttribute("src"))).toEqual(["/api/worlds/w1/images/m1", "/api/worlds/w1/images/m2"]);
    expect(screen.getByRole("button", { name: "Sala" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cantina" })).toBeNull();
  });

  it("is moved inside its area", async () => {
    const { server } = setup(mappedTree(), "places", "p1", { routes: { "PATCH /api/worlds/w1/places/p1": [element("p1")] } });
    fireEvent.click(buttonNamed("Sposta il segnaposto"));
    fireEvent.click(screen.getAllByTestId("atlas-map")[0] ?? surface(), { clientX: 200, clientY: 100 });
    await waitFor(() => { expect(server.bodies["PATCH /api/worlds/w1/places/p1"]).toEqual([{ pin: { x: 0.25, y: 0.25 } }]); });
  });

  it("gets a scene on its own map: the pin, a name, and the scene is created", async () => {
    const { server, onPick } = setup(mappedTree(), "places", "p1", { routes: { "POST /api/worlds/w1/scenes": [created("s9")] } });
    fireEvent.click(buttonNamed("Aggiungi una scena"));
    fireEvent.click(screen.getAllByTestId("atlas-map")[1] ?? surface(), { clientX: 300, clientY: 150 });
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Soffitta" } });
    fireEvent.click(buttonNamed("Crea"));
    await waitFor(() => { expect(onPick).toHaveBeenCalledWith("s9"); });
    expect(server.bodies["POST /api/worlds/w1/scenes"]).toEqual([{ name: "Soffitta", parentId: "p1", pin: { x: 0.5, y: 0.5 } }]);
  });

  it("without its own map the DM loads one before putting scenes on it", () => {
    const tree = mappedTree();
    const place = tree.regions[0]?.areas[0]?.places[0];
    if (place !== undefined) place.mapImageId = null;
    setup(tree, "places", "p1");
    expect(screen.getByLabelText("Carica la mappa del luogo")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aggiungi una scena" })).toBeNull();
  });

  it("has no position on the map of the region when its area is not drawn on it, and nothing says it must be", () => {
    const tree: WorldTree = { regions: [{ ...el("r1", "Regno", { mapImageId: "m1" }), areas: [{ ...el("a1", "Foresta"), places: [{ ...el("p1", "Locanda"), scenes: [] }] }] }] };
    setup(tree, "places", "p1");
    expect(screen.queryByText(/serve prima/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Piazza sulla mappa" })).toBeNull();
    expect(screen.queryByTestId("atlas-map")).toBeNull();
  });

  it("a pin dragged on a map moves what it stands for", async () => {
    const { server } = setup(mappedTree(), "places", "p1", { routes: { "PATCH /api/worlds/w1/scenes/s1": [element("s1")] } });
    const pin = screen.getByRole("button", { name: "Sala" });
    const fire = (type: string, x: number, y: number): void => { pin.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true })); };
    fire("pointerdown", 340, 130);
    fire("pointermove", 400, 150);
    fire("pointerup", 400, 150);
    await waitFor(() => { expect(server.bodies["PATCH /api/worlds/w1/scenes/s1"]).toEqual([{ pin: { x: 0.75, y: 0.5 } }]); });
  });
});

describe("the map of a scene", () => {
  it("shows where it is on the map of its place, and is moved", async () => {
    const { server } = setup(mappedTree(), "scenes", "s1", { routes: { "PATCH /api/worlds/w1/scenes/s1": [element("s1")] } });
    expect(screen.getByRole("button", { name: "Sala" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(buttonNamed("Sposta il segnaposto"));
    clickAt(300, 150);
    await waitFor(() => { expect(server.bodies["PATCH /api/worlds/w1/scenes/s1"]).toEqual([{ pin: { x: 0.5, y: 0.5 } }]); });
  });

  it("one that is not on the map yet is placed, and without a map of its place there is nothing to place it on", async () => {
    const { server } = setup(mappedTree(), "scenes", "s2", { routes: { "PATCH /api/worlds/w1/scenes/s2": [element("s2")] } });
    fireEvent.click(buttonNamed("Piazza sulla mappa"));
    clickAt(300, 150);
    await waitFor(() => { expect(server.bodies["PATCH /api/worlds/w1/scenes/s2"]).toHaveLength(1); });
    cleanup();
    const tree = mappedTree();
    const place = tree.regions[0]?.areas[0]?.places[0];
    if (place !== undefined) place.mapImageId = null;
    setup(tree, "scenes", "s2");
    expect(screen.queryByTestId("atlas-map")).toBeNull();
    expect(screen.queryByText(/serve prima/)).toBeNull();
  });

  it("a player sees the pin and cannot move anything", () => {
    setup(mappedTree(), "scenes", "s1", { isDm: false });
    expect(screen.queryByRole("button", { name: "Sposta il segnaposto" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sala" })).toBeTruthy();
  });
});

describe("the exits between scenes, as arrows on the map of the place", () => {
  /** Two scenes pinned on the map of the place, and a third that is not. */
  function withScenes(): WorldTree {
    const tree = mappedTree();
    const place = tree.regions[0]?.areas[0]?.places[0];
    if (place !== undefined) place.scenes = [el("s1", "Sala", { pin: { x: 0.2, y: 0.5 } }), el("s2", "Cantina", { pin: { x: 0.8, y: 0.5 } }), el("s3", "Tetto")];
    return tree;
  }
  const link = (id: string, from: string, to: string, label = ""): SceneLinkView => ({ id, fromSceneId: from, toSceneId: to, label });

  it("draws an arrow for each exit between two scenes pinned on the map of this place", () => {
    setup(withScenes(), "places", "p1", { links: [link("l1", "s1", "s2"), link("l2", "s2", "s1")] });
    expect(screen.getByRole("button", { name: "Uscita da Sala verso Cantina" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Uscita da Cantina verso Sala" })).toBeTruthy();
  });

  it("names the exit when it has a name", () => {
    setup(withScenes(), "places", "p1", { links: [link("l1", "s1", "s2", "Botola")] });
    expect(screen.getByRole("button", { name: "Uscita da Sala verso Cantina (Botola)" })).toBeTruthy();
  });

  it("leaves out an exit that has a scene not on this map: not pinned, or in another place", () => {
    setup(withScenes(), "places", "p1", { links: [link("l1", "s1", "s3"), link("l2", "s1", "altrove")] });
    expect(screen.queryByRole("button", { name: /Uscita da/ })).toBeNull();
  });

  it("also shows them on the page of a scene of the place", () => {
    setup(withScenes(), "scenes", "s1", { links: [link("l1", "s1", "s2")] });
    expect(screen.getByRole("button", { name: "Uscita da Sala verso Cantina" })).toBeTruthy();
  });

  it("picking an arrow offers to remove that exit, and removing it asks the server", async () => {
    const { server, onChange } = setup(withScenes(), "places", "p1", { links: [link("l1", "s1", "s2")], routes: { "DELETE /api/worlds/w1/scene-links/l1": [{ status: 204 }] } });
    fireEvent.click(screen.getByRole("button", { name: "Uscita da Sala verso Cantina" }));
    expect(screen.getByText("Uscita da Sala verso Cantina", { selector: "p" })).toBeTruthy();
    fireEvent.click(buttonNamed("Elimina l'uscita"));
    await waitFor(() => { expect(onChange).toHaveBeenCalled(); });
    expect(server.calls).toContain("DELETE /api/worlds/w1/scene-links/l1");
  });

  it("making an exit: the start, then the end, picked on the map", async () => {
    const { server, onChange } = setup(withScenes(), "places", "p1", { routes: { "POST /api/worlds/w1/scene-links": [{ status: 201, body: { link: { id: "l9", fromSceneId: "s1", toSceneId: "s2", label: "" } } }] } });
    fireEvent.click(buttonNamed("Traccia un'uscita"));
    expect(screen.getByRole("status").textContent).toBe("Scegli prima la scena di partenza e poi quella di arrivo.");
    const map = within(screen.getAllByTestId("atlas-map")[1] ?? document.body);
    fireEvent.click(map.getByRole("button", { name: "Sala" }));
    fireEvent.click(map.getByRole("button", { name: "Cantina" }));
    await waitFor(() => { expect(onChange).toHaveBeenCalled(); });
    expect(server.bodies["POST /api/worlds/w1/scene-links"]).toEqual([{ fromSceneId: "s1", toSceneId: "s2", label: "" }]);
  });

  it("an exit that is there already is refused, and the refusal is said", async () => {
    setup(withScenes(), "places", "p1", { routes: { "POST /api/worlds/w1/scene-links": [{ status: 409, body: { error: "errors.world.link-exists" } }] } });
    fireEvent.click(buttonNamed("Traccia un'uscita"));
    const map = within(screen.getAllByTestId("atlas-map")[1] ?? document.body);
    fireEvent.click(map.getByRole("button", { name: "Sala" }));
    fireEvent.click(map.getByRole("button", { name: "Cantina" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Queste due scene sono già collegate.");
  });

  it("a player has no exits to see and no way to make one", () => {
    setup(withScenes(), "places", "p1", { isDm: false });
    expect(screen.queryByRole("button", { name: /Uscita da/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Traccia un'uscita" })).toBeNull();
  });

  it("needs two scenes pinned on the map to make an exit between them", () => {
    setup(mappedTree(), "places", "p1");
    expect(screen.queryByRole("button", { name: "Traccia un'uscita" })).toBeNull();
  });
});
