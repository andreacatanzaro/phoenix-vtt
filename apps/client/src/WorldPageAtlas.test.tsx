// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { fakeServer } from "./test-helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const el = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, description: "", revealed: true, ...extra });
const shape = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }];

/** A mapped region with a placed area, place and scene, and, made before the maps, an area, a place and a scene not placed. */
const tree = {
  regions: [{
    ...el("r1", "Regno", { mapImageId: "m1" }),
    areas: [
      { ...el("a1", "Foresta", { polygon: shape }), places: [{ ...el("p1", "Locanda", { pin: { x: 0.5, y: 0.3 }, mapImageId: "m2" }), scenes: [el("s1", "Sala", { pin: { x: 0.2, y: 0.2 } }), el("s2", "Cantina")] }, el("p2", "Rifugio", { scenes: [] })].map((p) => ({ scenes: [], ...p })) },
      { ...el("a2", "Monti"), places: [] },
    ],
  }],
};

/** A world with no map anywhere: a region, an area, a place and a scene, all plain elements of the list. */
const mapless = {
  regions: [{ ...el("r1", "Regno"), areas: [{ ...el("a1", "Foresta"), places: [{ ...el("p1", "Locanda"), scenes: [el("s1", "Sala")] }] }] }],
};

async function openWorld(role: "dm" | "player", shown: unknown = tree) {
  const server = fakeServer({
    "GET /api/auth/me": [{ status: 200, body: { account: { id: "1", username: "Aldo" } } }],
    "GET /api/worlds": [{ status: 200, body: { worlds: [{ id: "w1", name: "Phoenix", role, gameTimeMinutes: 0 }] } }],
    "GET /api/worlds/w1/tree": [{ status: 200, body: shown }],
    "GET /api/worlds/w1/scene-links": [{ status: 200, body: { links: [] } }],
    "POST /api/worlds/w1/areas": [{ status: 201, body: { element: el("a9", "Paludi") } }],
    "POST /api/worlds/w1/places": [{ status: 201, body: { element: el("p9", "Torre") } }],
    "POST /api/worlds/w1/scenes": [{ status: 201, body: { element: el("s9", "Soffitta") } }],
  });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Apri Phoenix" }));
  const nav = await screen.findByRole("navigation", { name: "Struttura" });
  return { nav, server };
}

const pick = async (nav: HTMLElement, name: string): Promise<void> => {
  const button = (await within(nav).findByText(name, { selector: ".label" })).closest("button");
  if (button === null) throw new Error(`no button ${name}`);
  fireEvent.click(button);
};

describe("the atlas for the DM", () => {
  it("lists what is not on a map yet, to be placed or deleted, level by level", async () => {
    const { nav } = await openWorld("dm");
    const list = await within(nav).findByRole("region", { name: "Da piazzare" });
    const names = within(list).getAllByRole("button").map((b) => b.textContent);
    expect(names).toEqual(["Monti (Area)", "Rifugio (Luogo)", "Cantina (Scena)"]);
  });

  it("picking one from that list shows it, with a note that it is not on a map and how to place it", async () => {
    const { nav } = await openWorld("dm");
    const list = await within(nav).findByRole("region", { name: "Da piazzare" });
    fireEvent.click(within(list).getByRole("button", { name: /Monti/ }));
    expect(await screen.findByText("Non è ancora su una mappa.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Piazza sulla mappa" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Elimina" })).toBeTruthy();
  });

  it("where there is a map to put things on there is no creation by name: a region with a map has no form for areas", async () => {
    const { nav } = await openWorld("dm");
    await within(nav).findByRole("region", { name: "Da piazzare" });
    expect(screen.getByLabelText("Nuova regione")).toBeTruthy();
    expect(screen.queryByLabelText("Nuova area")).toBeNull();
  });

  it("a place with a map has no form for scenes, and an area drawn on a map has none for places", async () => {
    const { nav } = await openWorld("dm");
    await pick(nav, "Foresta");
    expect(screen.queryByLabelText("Nuovo luogo")).toBeNull();
    await pick(nav, "Locanda");
    expect(screen.queryByLabelText("Nuova scena")).toBeNull();
  });

  it("without maps, areas, places and scenes are made by name, and what is made is picked", async () => {
    const { nav, server } = await openWorld("dm", mapless);
    expect(within(nav).queryByRole("region", { name: "Da piazzare" })).toBeNull();
    /** Types a name in the form with this label and adds it. */
    const add = async (label: string, name: string): Promise<void> => {
      const input = await screen.findByLabelText(label);
      fireEvent.change(input, { target: { value: name } });
      const form = input.closest("form");
      if (form === null) throw new Error("no form");
      fireEvent.click(within(form).getByRole("button", { name: "Aggiungi" }));
    };
    await add("Nuova area", "Paludi");
    await waitFor(() => { expect(server.bodies["POST /api/worlds/w1/areas"]).toEqual([{ name: "Paludi", parentId: "r1" }]); });
    await pick(nav, "Foresta");
    await add("Nuovo luogo", "Torre");
    await waitFor(() => { expect(server.bodies["POST /api/worlds/w1/places"]).toEqual([{ name: "Torre", parentId: "a1" }]); });
    await pick(nav, "Locanda");
    await add("Nuova scena", "Soffitta");
    await waitFor(() => { expect(server.bodies["POST /api/worlds/w1/scenes"]).toEqual([{ name: "Soffitta", parentId: "p1" }]); });
  });

  it("the path above an element can be walked back, one step at a time", async () => {
    const { nav } = await openWorld("dm");
    await pick(nav, "Locanda");
    const where = await screen.findByRole("navigation", { name: "Percorso" });
    expect(within(where).getAllByRole("button").map((b) => b.textContent)).toEqual(["Regno", "Foresta"]);
    fireEvent.click(within(where).getByRole("button", { name: "Foresta" }));
    expect(await screen.findByRole("heading", { name: "Foresta" })).toBeTruthy();
    expect(within(screen.getByRole("navigation", { name: "Percorso" })).getAllByRole("button").map((b) => b.textContent)).toEqual(["Regno"]);
  });

  it("a region has no path above it", async () => {
    await openWorld("dm");
    await screen.findByRole("heading", { name: "Regno" });
    expect(screen.queryByRole("navigation", { name: "Percorso" })).toBeNull();
  });

  it("the map of the region is on its page, with the area and the place on it", async () => {
    await openWorld("dm");
    expect(await screen.findByRole("img", { name: "Mappa di Regno" })).toBeTruthy();
    const map = within(screen.getByTestId("atlas-map"));
    expect(map.getByRole("button", { name: "Foresta" })).toBeTruthy();
    expect(map.getByRole("button", { name: "Locanda" })).toBeTruthy();
  });
});

describe("the atlas for a player", () => {
  it("shows only what is on a map, and no list of what waits to be placed", async () => {
    const { nav } = await openWorld("player");
    await within(nav).findByText("Regno", { selector: ".label" });
    expect(within(nav).queryByRole("region", { name: "Da piazzare" })).toBeNull();
    expect(within(nav).queryByText("Monti", { selector: ".label" })).toBeNull();
    expect(within(nav).queryByText("Cantina", { selector: ".label" })).toBeNull();
    expect(within(nav).queryByText("Rifugio", { selector: ".label" })).toBeNull();
  });

  it("in a world without maps a player sees everything that is revealed, since there is no other way to find it", async () => {
    const { nav } = await openWorld("player", mapless);
    await pick(nav, "Foresta");
    await pick(nav, "Locanda");
    expect(await within(nav).findByText("Sala", { selector: ".label" })).toBeTruthy();
    expect(screen.queryByLabelText("Nuova scena")).toBeNull();
  });

  it("walks the maps in read only: the region map opens into an area and a place, with nothing to change", async () => {
    await openWorld("player");
    expect(await screen.findByRole("img", { name: "Mappa di Regno" })).toBeTruthy();
    fireEvent.keyDown(within(screen.getByTestId("atlas-map")).getByRole("button", { name: "Locanda" }), { key: "Enter" });
    expect(await screen.findByRole("heading", { name: "Locanda" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Mappa di Locanda" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aggiungi una scena" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Elimina" })).toBeNull();
  });
});
