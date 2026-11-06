// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

type Route = { status: number; body?: unknown };

function fakeServer(routes: Record<string, Route[]>): string[] {
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

beforeEach(() => { localStorage.clear(); });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const account = { id: "1", username: "Aldo" };
const worlds = [
  { id: "w1", name: "Valdoria", role: "dm", gameTimeMinutes: 90 },
  { id: "w2", name: "Terre Basse", role: "player", gameTimeMinutes: 0 },
  { id: "w3", name: "Isole del Vento", role: "player", gameTimeMinutes: 600 },
];

async function openList(list = worlds): Promise<string[]> {
  const calls = fakeServer({
    "GET /api/auth/me": [{ status: 200, body: { account } }],
    "GET /api/worlds": [{ status: 200, body: { worlds: list } }],
    "GET /api/worlds/w1/tree": [{ status: 200, body: { regions: [] } }],
    "GET /api/worlds/w1/scene-links": [{ status: 200, body: { links: [] } }],
  });
  render(<App />);
  await screen.findByRole("heading", { name: "I miei mondi" });
  if (list.length > 0) await screen.findAllByRole("listitem");
  else await screen.findByText(/Non fai ancora parte di nessun mondo/);
  return calls;
}

describe("my worlds, laid out like the adventures of Narrantium", () => {
  it("has the title and the line under it, and the card to start a new world", async () => {
    await openList();
    expect(screen.getByText("Scegli un mondo per giocare o gestirlo.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nuovo mondo" })).toBeTruthy();
  });

  it("the new world is made from its card: the name is asked there, and the card closes the form again", async () => {
    const calls = fakeServer({
      "GET /api/auth/me": [{ status: 200, body: { account } }],
      "GET /api/worlds": [{ status: 200, body: { worlds: [] } }],
      "POST /api/worlds": [{ status: 201, body: { world: { id: "w9", name: "Nuovo", role: "dm", gameTimeMinutes: 0 } } }],
    });
    render(<App />);
    await screen.findByRole("heading", { name: "I miei mondi" });
    expect(screen.queryByLabelText("Nome del mondo")).toBeNull();
    const card = screen.getByRole("button", { name: "Nuovo mondo" });
    fireEvent.click(card);
    expect(card.getAttribute("aria-expanded")).toBe("true");
    fireEvent.change(screen.getByLabelText("Nome del mondo"), { target: { value: "Nuovo" } });
    fireEvent.click(screen.getByRole("button", { name: "Crea mondo" }));
    expect(await screen.findByText("Nuovo", { selector: ".name" })).toBeTruthy();
    expect(calls).toContain("POST /api/worlds");
    await waitFor(() => { expect(screen.queryByLabelText("Nome del mondo")).toBeNull(); });
  });

  it("lists the worlds with the count, each with its role, its game time and a button to open it", async () => {
    await openList();
    expect(screen.getByRole("heading", { name: "I tuoi mondi" }).textContent).toContain("3");
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    const first = within(rows.at(0) ?? document.body);
    expect(first.getByText("Valdoria")).toBeTruthy();
    expect(first.getByText("Dungeon Master")).toBeTruthy();
    expect(first.getByText("Tempo di gioco: 1 h 30 min")).toBeTruthy();
    expect(first.getByRole("button", { name: "Apri Valdoria" })).toBeTruthy();
  });

  it("filters by the role, and by the name searched", async () => {
    await openList();
    const names = (): (string | null)[] => screen.getAllByRole("listitem").map((r) => r.querySelector(".name")?.textContent ?? null);
    fireEvent.click(screen.getByRole("button", { name: "Come giocatore" }));
    expect(names()).toEqual(["Terre Basse", "Isole del Vento"]);
    expect(screen.getByRole("button", { name: "Come giocatore" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Come DM" }));
    expect(names()).toEqual(["Valdoria"]);
    fireEvent.click(screen.getByRole("button", { name: "Tutti" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Cerca per nome…" }), { target: { value: "vento" } });
    expect(names()).toEqual(["Isole del Vento"]);
  });

  it("says when nothing matches, and when there are no worlds at all", async () => {
    await openList();
    fireEvent.change(screen.getByRole("searchbox", { name: "Cerca per nome…" }), { target: { value: "zzz" } });
    expect(screen.getByText("Nessun mondo corrisponde alla ricerca.")).toBeTruthy();
    cleanup();
    vi.unstubAllGlobals();
    await openList([]);
    expect(screen.getByText(/Non fai ancora parte di nessun mondo/)).toBeTruthy();
  });

  it("there is nothing to continue until a world has been opened", async () => {
    await openList();
    expect(screen.queryByRole("heading", { name: "Continua da dove eri rimasto" })).toBeNull();
  });

  it("after opening a world, the next visit offers to continue there, with a big button, next to the way into the list", async () => {
    await openList();
    fireEvent.click(screen.getByRole("button", { name: "Apri Valdoria" }));
    await screen.findByRole("region", { name: "Valdoria" });
    fireEvent.click(screen.getByRole("button", { name: "Tutti i mondi" }));
    await screen.findByRole("heading", { name: "I miei mondi" });
    const section = await screen.findByRole("region", { name: "Continua da dove eri rimasto" });
    expect(within(section).getByText("Valdoria")).toBeTruthy();
    expect(within(section).getByText("Dungeon Master")).toBeTruthy();
    fireEvent.click(within(section).getByRole("button", { name: "Continua in Valdoria" }));
    expect(await screen.findByRole("region", { name: "Valdoria" })).toBeTruthy();
  });

  it("a world that is no longer there is not offered", async () => {
    localStorage.setItem("phoenix.last-world.1", "gone");
    await openList();
    expect(screen.queryByRole("region", { name: "Continua da dove eri rimasto" })).toBeNull();
  });

  it("storage that cannot be read does not stop the page", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    await openList();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    vi.restoreAllMocks();
  });
});
