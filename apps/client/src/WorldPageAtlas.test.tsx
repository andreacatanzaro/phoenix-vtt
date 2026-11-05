// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { fakeServer, graphNode, pickElement } from "./test-helpers";

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

/** A world with no map anywhere: a region, an area, a place and a scene, all plain elements. */
const mapless = {
  regions: [{ ...el("r1", "Regno"), areas: [{ ...el("a1", "Foresta"), places: [{ ...el("p1", "Locanda"), scenes: [el("s1", "Sala"), el("s2", "Cantina")] }] }] }],
};

type Routes = Record<string, { status: number; body?: unknown }[]>;
async function openWorld(role: "dm" | "player", shown: unknown = tree, extra: Routes = {}) {
  const server = fakeServer({
    "GET /api/auth/me": [{ status: 200, body: { account: { id: "1", username: "Aldo" } } }],
    "GET /api/worlds": [{ status: 200, body: { worlds: [{ id: "w1", name: "Phoenix", role, gameTimeMinutes: 0 }] } }],
    "GET /api/worlds/w1/tree": [{ status: 200, body: shown }],
    "GET /api/worlds/w1/scene-links": [{ status: 200, body: { links: [] } }],
    "POST /api/worlds/w1/areas": [{ status: 201, body: { element: el("a9", "Paludi") } }],
    "POST /api/worlds/w1/places": [{ status: 201, body: { element: el("p9", "Torre") } }],
    "POST /api/worlds/w1/scenes": [{ status: 201, body: { element: el("s9", "Soffitta") } }],
    ...extra,
  });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Apri Phoenix" }));
  await screen.findByTestId("graph-sky");
  return { server };
}

const sky = (): HTMLElement => screen.getByTestId("graph-sky");
/** Goes into the group with this name, which is on the screen: it is picked, and the button to go in is pressed. */
async function enter(name: string): Promise<void> {
  fireEvent.click(await within(sky()).findByRole("button", { name }));
  fireEvent.click(screen.getByRole("button", { name: "Entra nel gruppo" }));
}
const crumbs = (): string[] => within(screen.getByRole("navigation", { name: "Dove sei nel mondo" })).getAllByRole("button").map((b) => b.textContent);

describe("the structure as a graph, for the DM", () => {
  it("shows the regions as groups, with what each holds, and a group is gone into level by level", async () => {
    await openWorld("dm");
    expect(graphNode("Regno")?.textContent).toContain("Regione");
    expect(graphNode("Regno")?.textContent).toContain("2");
    await enter("Regno");
    expect(await within(sky()).findByRole("button", { name: "Foresta" })).toBeTruthy();
    expect(graphNode("Regno")).toBeNull();
    await enter("Foresta");
    expect(await within(sky()).findByRole("button", { name: "Locanda" })).toBeTruthy();
    await enter("Locanda");
    expect(await within(sky()).findByRole("button", { name: "Sala" })).toBeTruthy();
    expect(graphNode("Cantina")).not.toBeNull();
    expect(crumbs()).toEqual(["Tutto il mondo", "Regno", "Foresta", "Locanda"]);
  });

  it("a double click on a group goes in as well", async () => {
    await openWorld("dm");
    fireEvent.doubleClick(await within(sky()).findByRole("button", { name: "Regno" }));
    expect(await within(sky()).findByRole("button", { name: "Foresta" })).toBeTruthy();
  });

  it("the path above is walked back, one step at a time", async () => {
    await openWorld("dm");
    await enter("Regno");
    await enter("Foresta");
    fireEvent.click(within(screen.getByRole("navigation", { name: "Dove sei nel mondo" })).getByRole("button", { name: "Regno" }));
    expect(await within(sky()).findByRole("button", { name: "Monti" })).toBeTruthy();
    expect(crumbs()).toEqual(["Tutto il mondo", "Regno"]);
    fireEvent.click(screen.getByRole("button", { name: "Tutto il mondo" }));
    expect(await within(sky()).findByRole("button", { name: "Regno" })).toBeTruthy();
    expect(crumbs()).toEqual(["Tutto il mondo"]);
  });

  it("what could be placed on a map that exists and is not is marked on its node", async () => {
    await openWorld("dm");
    await enter("Regno");
    expect(within(graphNode("Monti") ?? document.body).getByText("Da piazzare")).toBeTruthy();
    expect(within(graphNode("Foresta") ?? document.body).queryByText("Da piazzare")).toBeNull();
  });

  it("picking one that waits shows it, with a note that it is not on a map and how to place it", async () => {
    await openWorld("dm");
    await enter("Regno");
    fireEvent.click(await within(sky()).findByRole("button", { name: "Monti" }));
    expect(await screen.findByText("Non è ancora su una mappa.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Piazza sulla mappa" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Elimina" })).toBeTruthy();
  });

  it("the details of what is picked are on the right, and can be closed", async () => {
    await openWorld("dm");
    fireEvent.click(await within(sky()).findByRole("button", { name: "Regno" }));
    const detail = await screen.findByRole("complementary", { name: "Dettagli dell'elemento" });
    expect(within(detail).getByRole("heading", { name: "Regno" })).toBeTruthy();
    fireEvent.click(within(detail).getByRole("button", { name: "Chiudi" }));
    expect(screen.queryByRole("complementary", { name: "Dettagli dell'elemento" })).toBeNull();
  });

  it("the map of the region is in its details, with the area and the place on it", async () => {
    await openWorld("dm");
    fireEvent.click(await within(sky()).findByRole("button", { name: "Regno" }));
    expect(await screen.findByRole("img", { name: "Mappa di Regno" })).toBeTruthy();
    const map = within(screen.getByTestId("atlas-map"));
    expect(map.getByRole("button", { name: "Foresta" })).toBeTruthy();
    expect(map.getByRole("button", { name: "Locanda" })).toBeTruthy();
  });

  it("the group being shown can be edited from its path, without picking one of its nodes", async () => {
    await openWorld("dm");
    await enter("Regno");
    fireEvent.click(screen.getByRole("button", { name: "Modifica gruppo" }));
    expect(await screen.findByRole("heading", { name: "Regno" })).toBeTruthy();
  });

  it("Trova lists every element with the path above it, and choosing one goes there and picks it", async () => {
    await openWorld("dm");
    const find = await screen.findByLabelText("Trova");
    expect(within(find).getAllByRole("option").map((o) => o.textContent)).toContain("Regno › Foresta › Locanda › Sala");
    await pickElement("Sala");
    expect(await screen.findByRole("heading", { name: "Sala" })).toBeTruthy();
    expect(crumbs()).toEqual(["Tutto il mondo", "Regno", "Foresta", "Locanda"]);
    expect(graphNode("Sala")?.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("making and moving things on the graph", () => {
  it("where there is a map to put things on, adding goes to the map: the button says so and opens the details of the group, where the map is", async () => {
    const { server } = await openWorld("dm", tree);
    await enter("Regno");
    expect(screen.queryByRole("button", { name: "Aggiungi Area" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi Area sulla mappa" }));
    expect(screen.queryByLabelText("Nuova area")).toBeNull();
    expect(await screen.findByRole("img", { name: "Mappa di Regno" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Disegna un'area" })).toBeTruthy();
    expect(server.calls.filter((c) => c.startsWith("POST"))).toEqual([]);
  });

  it("the same for places in an area that is drawn, and for scenes in a place that has a map", async () => {
    await openWorld("dm");
    await enter("Regno");
    await enter("Foresta");
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi Luogo sulla mappa" }));
    expect(await screen.findByRole("button", { name: "Aggiungi un luogo in quest'area" })).toBeTruthy();
    await enter("Locanda");
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi Scena sulla mappa" }));
    expect(await screen.findByRole("button", { name: "Aggiungi una scena" })).toBeTruthy();
  });

  it("the regions have no map above them: they are always added by name", async () => {
    await openWorld("dm");
    expect(screen.getByRole("button", { name: "Aggiungi Regione" })).toBeTruthy();
  });

  it("an area that is not drawn is added to by name, even if its region has a map", async () => {
    await openWorld("dm");
    await enter("Regno");
    await enter("Monti");
    expect(screen.getByRole("button", { name: "Aggiungi Luogo" })).toBeTruthy();
  });

  it("when the server refuses a name that was typed while the map appeared, the reason stays on the screen", async () => {
    await openWorld("dm", mapless, { "POST /api/worlds/w1/areas": [{ status: 400, body: { error: "errors.world.placement-required" } }] });
    await enter("Regno");
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi Area" }));
    fireEvent.change(screen.getByLabelText("Nuova area"), { target: { value: "Paludi" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Sopra c'è una mappa: questo elemento va piazzato sulla mappa, non creato con il solo nome.");
  });

  it("a link that is refused says why and the message stays: the graph is not read again over it", async () => {
    const { server } = await openWorld("dm", mapless, { "POST /api/worlds/w1/scene-links": [{ status: 409, body: { error: "errors.world.link-exists" } }] });
    await enter("Regno");
    await enter("Foresta");
    await enter("Locanda");
    fireEvent.click(await within(sky()).findByRole("button", { name: "Sala" }));
    fireEvent.click(screen.getByRole("button", { name: "Collega da scena…" }));
    fireEvent.click(within(sky()).getByRole("button", { name: "Cantina" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Queste due scene sono già collegate.");
    // Give the page the time a second reading of the tree would take: the message is still there.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(screen.getByRole("alert").textContent).toBe("Queste due scene sono già collegate.");
    expect(server.calls.filter((c) => c === "GET /api/worlds/w1/tree")).toHaveLength(1);
  });

  it("a node that could not be saved where it was dropped says why, and the message stays", async () => {
    const { server } = await openWorld("dm", mapless, { "PATCH /api/worlds/w1/regions/r1": [{ status: 500 }] });
    const node = await within(sky()).findByRole("button", { name: "Regno" });
    const at = (type: string, x: number, y: number): void => { act(() => { node.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true })); }); };
    at("pointerdown", 500, 300);
    at("pointermove", 620, 340);
    at("pointerup", 620, 340);
    expect(await screen.findByRole("alert")).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(server.calls.filter((c) => c === "GET /api/worlds/w1/tree")).toHaveLength(1);
  });

  it("without maps, areas, places and scenes are added by name, at each level", async () => {
    const { server } = await openWorld("dm", mapless);
    /** Types a name in the form with this label and adds it. */
    const add = async (button: string, label: string, name: string): Promise<void> => {
      fireEvent.click(screen.getByRole("button", { name: button }));
      const input = await screen.findByLabelText(label);
      fireEvent.change(input, { target: { value: name } });
      const form = input.closest("form");
      if (form === null) throw new Error("no form");
      fireEvent.click(within(form).getByRole("button", { name: "Aggiungi" }));
    };
    await enter("Regno");
    await add("Aggiungi Area", "Nuova area", "Paludi");
    await waitFor(() => { expect(server.bodies["POST /api/worlds/w1/areas"]).toEqual([{ name: "Paludi", parentId: "r1" }]); });
    await enter("Foresta");
    await add("Aggiungi Luogo", "Nuovo luogo", "Torre");
    await waitFor(() => { expect(server.bodies["POST /api/worlds/w1/places"]).toEqual([{ name: "Torre", parentId: "a1" }]); });
    await enter("Locanda");
    await add("Aggiungi Scena", "Nuova scena", "Soffitta");
    await waitFor(() => { expect(server.bodies["POST /api/worlds/w1/scenes"]).toEqual([{ name: "Soffitta", parentId: "p1" }]); });
  });

  it("a node dragged to another place is saved there", async () => {
    const { server } = await openWorld("dm", mapless, { "PATCH /api/worlds/w1/regions/r1": [{ status: 200, body: { element: el("r1", "Regno") } }] });
    const node = await within(sky()).findByRole("button", { name: "Regno" });
    const at = (type: string, x: number, y: number): void => { act(() => { node.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true })); }); };
    at("pointerdown", 500, 300);
    at("pointermove", 620, 340);
    at("pointerup", 620, 340);
    await waitFor(() => { expect(server.bodies["PATCH /api/worlds/w1/regions/r1"]).toHaveLength(1); });
    const body = server.bodies["PATCH /api/worlds/w1/regions/r1"]?.[0];
    expect(Object.keys(body ?? {}).sort()).toEqual(["graphX", "graphY"]);
    expect(Object.values(body ?? {}).every((v) => typeof v === "number")).toBe(true);
  });

  it("the exits between the scenes of a place are lines, and picking one shows the scene it starts from", async () => {
    await openWorld("dm", mapless, { "GET /api/worlds/w1/scene-links": [{ status: 200, body: { links: [{ id: "l1", fromSceneId: "s1", toSceneId: "s2", label: "Botola" }] } }] });
    await enter("Regno");
    await enter("Foresta");
    await enter("Locanda");
    fireEvent.click(await screen.findByRole("button", { name: "Uscita da Sala verso Cantina (Botola)" }));
    expect(await screen.findByRole("heading", { name: "Sala" })).toBeTruthy();
  });

  it("a scene is linked to another by the link button and then the other scene", async () => {
    const { server } = await openWorld("dm", mapless, { "POST /api/worlds/w1/scene-links": [{ status: 201, body: { link: { id: "l9", fromSceneId: "s1", toSceneId: "s2", label: "" } } }] });
    await enter("Regno");
    await enter("Foresta");
    await enter("Locanda");
    fireEvent.click(await within(sky()).findByRole("button", { name: "Sala" }));
    fireEvent.click(screen.getByRole("button", { name: "Collega da scena…" }));
    fireEvent.click(within(sky()).getByRole("button", { name: "Cantina" }));
    await waitFor(() => { expect(server.bodies["POST /api/worlds/w1/scene-links"]).toEqual([{ fromSceneId: "s1", toSceneId: "s2", label: "" }]); });
  });
});

describe("the structure as a graph, for a player", () => {
  it("shows only what is on a map, and what waits to be placed is not even in the search", async () => {
    await openWorld("player");
    const find = await screen.findByLabelText("Trova");
    const options = within(find).getAllByRole("option").map((o) => o.textContent);
    expect(options).toContain("Regno › Foresta");
    for (const hidden of ["Monti", "Cantina", "Rifugio"]) expect(options.some((o) => o.includes(hidden))).toBe(false);
    await enter("Regno");
    expect(graphNode("Monti")).toBeNull();
  });

  it("can only walk it: nothing to add, move, link, or change", async () => {
    await openWorld("player");
    expect(screen.queryByRole("button", { name: /^Aggiungi/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Blocca i nodi" })).toBeNull();
    fireEvent.click(await within(sky()).findByRole("button", { name: "Regno" }));
    expect(await screen.findByRole("img", { name: "Mappa di Regno" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Elimina" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Disegna un'area" })).toBeNull();
  });

  it("walks the maps in the details too: a place on the map of the region opens its own page, read only", async () => {
    await openWorld("player");
    fireEvent.click(await within(sky()).findByRole("button", { name: "Regno" }));
    fireEvent.keyDown(within(await screen.findByTestId("atlas-map")).getByRole("button", { name: "Locanda" }), { key: "Enter" });
    expect(await screen.findByRole("heading", { name: "Locanda" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Mappa di Locanda" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aggiungi una scena" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Elimina" })).toBeNull();
  });

  it("in a world without maps a player sees everything that is revealed, since there is no other way to find it", async () => {
    await openWorld("player", mapless);
    await pickElement("Sala");
    expect(await screen.findByRole("heading", { name: "Sala" })).toBeTruthy();
    expect(graphNode("Cantina")).not.toBeNull();
  });

  it("is told there is nothing to see when nothing is revealed", async () => {
    await openWorld("player", { regions: [] });
    expect(await screen.findByText("Qui non c'è ancora niente.")).toBeTruthy();
  });
});
