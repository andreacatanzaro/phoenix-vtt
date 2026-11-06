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

  it("the details of what is picked are on the right, and can be closed", async () => {
    await openWorld("dm");
    fireEvent.click(await within(sky()).findByRole("button", { name: "Regno" }));
    const detail = await screen.findByRole("complementary", { name: "Dettagli dell'elemento" });
    expect(within(detail).getByRole("heading", { name: "Regno" })).toBeTruthy();
    fireEvent.click(within(detail).getByRole("button", { name: "Chiudi" }));
    expect(screen.queryByRole("complementary", { name: "Dettagli dell'elemento" })).toBeNull();
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
  it("everything is added by name, also under a region, an area or a place that has a map", async () => {
    await openWorld("dm");
    expect(screen.getByRole("button", { name: "Aggiungi Regione" })).toBeTruthy();
    await enter("Regno");
    expect(screen.getByRole("button", { name: "Aggiungi Area" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /sulla mappa/ })).toBeNull();
    await enter("Foresta");
    expect(screen.getByRole("button", { name: "Aggiungi Luogo" })).toBeTruthy();
    await enter("Locanda");
    expect(screen.getByRole("button", { name: "Aggiungi Scena" })).toBeTruthy();
  });

  it("no map of the atlas is shown: not in the details, not on the nodes, and nothing waits to be placed", async () => {
    await openWorld("dm");
    expect(graphNode("Regno")?.querySelector("img")).toBeNull();
    fireEvent.click(await within(sky()).findByRole("button", { name: "Regno" }));
    await screen.findByRole("heading", { name: "Regno" });
    expect(screen.queryByTestId("atlas-map")).toBeNull();
    expect(screen.queryByRole("img", { name: "Mappa di Regno" })).toBeNull();
    await enter("Regno");
    expect(within(graphNode("Monti") ?? document.body).queryByText("Da piazzare")).toBeNull();
    fireEvent.click(await within(sky()).findByRole("button", { name: "Monti" }));
    expect(screen.queryByText("Non è ancora su una mappa.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Piazza sulla mappa" })).toBeNull();
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

  it("one click adds an area, a place or a scene with a provisional name, inside the group being shown, at each level", async () => {
    const { server } = await openWorld("dm", mapless);
    await enter("Regno");
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi Area" }));
    await waitFor(() => { expect(server.bodies["POST /api/worlds/w1/areas"]).toEqual([{ name: "Nuova area", parentId: "r1" }]); });
    await enter("Foresta");
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi Luogo" }));
    await waitFor(() => { expect(server.bodies["POST /api/worlds/w1/places"]).toEqual([{ name: "Nuovo luogo", parentId: "a1" }]); });
    await enter("Locanda");
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi Scena" }));
    await waitFor(() => { expect(server.bodies["POST /api/worlds/w1/scenes"]).toEqual([{ name: "Nuova scena", parentId: "p1" }]); });
  });

  it("the details are a floating menu over the graph, on the right, and do not take room from it", async () => {
    await openWorld("dm", mapless);
    fireEvent.click(await within(sky()).findByRole("button", { name: "Regno" }));
    const panel = await screen.findByRole("complementary", { name: "Dettagli dell'elemento" });
    expect(panel.className).toContain("floating");
    expect(sky().parentElement?.className).not.toContain("with-detail");
  });

  it("a refused creation says why, and nothing is selected", async () => {
    await openWorld("dm", mapless, { "POST /api/worlds/w1/areas": [{ status: 500 }] });
    await enter("Regno");
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi Area" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("complementary", { name: "Dettagli dell'elemento" })).toBeNull();
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
  it("sees everything that is revealed, also what was made before the maps", async () => {
    await openWorld("player");
    const find = await screen.findByLabelText("Trova");
    const options = within(find).getAllByRole("option").map((o) => o.textContent);
    for (const name of ["Monti", "Cantina", "Rifugio"]) expect(options.some((o) => o.includes(name))).toBe(true);
    await enter("Regno");
    expect(graphNode("Monti")).not.toBeNull();
  });

  it("can only walk it: nothing to add, move, link, or change", async () => {
    await openWorld("player");
    expect(screen.queryByRole("button", { name: /^Aggiungi/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Blocca i nodi" })).toBeNull();
    fireEvent.click(await within(sky()).findByRole("button", { name: "Regno" }));
    expect(await screen.findByRole("heading", { name: "Regno" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Elimina" })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("is told there is nothing to see when nothing is revealed", async () => {
    await openWorld("player", { regions: [] });
    expect(await screen.findByText("Qui non c'è ancora niente.")).toBeTruthy();
  });
});
