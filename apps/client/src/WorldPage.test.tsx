// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { fakeServer } from "./test-helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const account = { id: "1", username: "Aldo" };
const dmWorld = { id: "w1", name: "Phoenix", role: "dm", gameTimeMinutes: 0 };
const playerWorld = { id: "w1", name: "Phoenix", role: "player", gameTimeMinutes: 0 };

const el = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, description: "", revealed: true, ...extra });
const fullTree = {
  regions: [
    {
      ...el("r1", "Regno"),
      areas: [{ ...el("a1", "Foresta"), places: [{ ...el("p1", "Locanda"), scenes: [el("s1", "Sala", { dmNotes: "trappola sotto il tappeto" }), el("s2", "Cantina")] }] }],
    },
  ],
};
const playerTree = {
  regions: [{ ...el("r1", "Regno"), areas: [{ ...el("a1", "Foresta"), places: [{ ...el("p1", "Locanda", { description: "Una locanda accogliente" }), scenes: [el("s1", "Sala")] }] }] }],
};

/** The label of an entry of the tree, or null when it is not there. */
function treeLabel(name: string): HTMLElement | null {
  return within(screen.getByRole("navigation", { name: "Struttura" })).queryByText(name, { selector: ".label" });
}

/** The button of an entry of the tree, once it has appeared. */
async function treeButton(name: string): Promise<HTMLElement> {
  const nav = await screen.findByRole("navigation", { name: "Struttura" });
  const button = (await within(nav).findByText(name, { selector: ".label" })).closest("button");
  if (button === null) throw new Error(`"${name}" is not a button`);
  return button;
}

/** The nth field with this label: the edit form of a session comes before the creation form at the bottom. */
function fieldAt(label: string, index = 0): HTMLInputElement | HTMLTextAreaElement {
  const found = screen.getAllByLabelText(label)[index];
  if (!(found instanceof HTMLInputElement || found instanceof HTMLTextAreaElement)) throw new Error(`no field "${label}" at ${String(index)}`);
  return found;
}

/** Starts the app signed in, opens the only world and waits for it. */
async function openWorld(world: typeof dmWorld, routes: Record<string, { status: number; body?: unknown }[]>) {
  const server = fakeServer({
    "GET /api/auth/me": [{ status: 200, body: { account } }],
    "GET /api/worlds": [{ status: 200, body: { worlds: [world] } }],
    // The DM's structure screen also asks for the exits; most tests do not care, so there are none unless a test says so.
    "GET /api/worlds/w1/scene-links": [{ status: 200, body: { links: [] } }],
    ...routes,
  });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Apri Phoenix" }));
  return server;
}

describe("opening a world", () => {
  it("opens from the list and goes back", async () => {
    await openWorld(dmWorld, { "GET /api/worlds/w1/tree": [{ status: 200, body: { regions: [] } }] });
    expect(await screen.findByText("Il mondo è vuoto. Comincia con la prima regione.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Phoenix" })).toBeTruthy();
    expect(screen.getByText("Dungeon Master")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tutti i mondi" }));
    expect(await screen.findByRole("heading", { name: "I tuoi mondi" })).toBeTruthy();
  });

  it("the DM and a player see the same four sections", async () => {
    const names = async (): Promise<(string | null)[]> => (await within(await screen.findByRole("navigation", { name: "Sezioni del mondo" })).findAllByRole("button")).map((b) => b.textContent);
    await openWorld(dmWorld, { "GET /api/worlds/w1/tree": [{ status: 200, body: fullTree }] });
    expect(await names()).toEqual(["Struttura", "Sessioni", "Tavolo", "Membri"]);
    cleanup();
    vi.unstubAllGlobals();
    await openWorld(playerWorld, { "GET /api/worlds/w1/tree": [{ status: 200, body: playerTree }] });
    expect(await names()).toEqual(["Struttura", "Sessioni", "Tavolo", "Membri"]);
  });

  it("marks the section being looked at", async () => {
    await openWorld(dmWorld, { "GET /api/worlds/w1/tree": [{ status: 200, body: { regions: [] } }], "GET /api/worlds/w1/members": [{ status: 200, body: { members: [] } }] });
    expect((await screen.findByRole("button", { name: "Struttura" })).getAttribute("aria-current")).toBe("page");
    fireEvent.click(screen.getByRole("button", { name: "Membri" }));
    await waitFor(() => { expect(screen.getByRole("button", { name: "Membri" }).getAttribute("aria-current")).toBe("page"); });
    expect(screen.getByRole("button", { name: "Struttura" }).getAttribute("aria-current")).toBeNull();
  });
});

describe("the structure", () => {
  it("shows the DM the whole tree, with a mark for what the players can see", async () => {
    await openWorld(dmWorld, { "GET /api/worlds/w1/tree": [{ status: 200, body: fullTree }] });
    for (const name of ["Regno", "Foresta", "Locanda", "Sala", "Cantina"]) expect(await treeButton(name)).toBeTruthy();
    expect(screen.getAllByRole("img", { name: "Visibile ai giocatori" })).toHaveLength(5);
  });

  it("marks what is still hidden from the players", async () => {
    const hidden = { regions: [{ ...el("r1", "Regno", { revealed: false }), areas: [] }] };
    await openWorld(dmWorld, { "GET /api/worlds/w1/tree": [{ status: 200, body: hidden }] });
    expect(await screen.findByRole("img", { name: "Nascosto ai giocatori" })).toBeTruthy();
  });

  it("the DM picks an element and sees its notes, its switch and its controls", async () => {
    await openWorld(dmWorld, { "GET /api/worlds/w1/tree": [{ status: 200, body: fullTree }] });
    fireEvent.click(await treeButton("Sala"));
    expect(await screen.findByText("trappola sotto il tappeto")).toBeTruthy();
    expect(screen.getByText("Solo per il DM")).toBeTruthy();
    expect(screen.getByRole("checkbox")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Modifica" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Elimina" })).toBeTruthy();
  });

  it("shows a player only what was revealed, without notes or controls", async () => {
    await openWorld(playerWorld, { "GET /api/worlds/w1/tree": [{ status: 200, body: playerTree }] });
    fireEvent.click(await treeButton("Locanda"));
    expect(await screen.findByText("Una locanda accogliente")).toBeTruthy();
    expect(treeLabel("Cantina")).toBeNull();
    expect(screen.queryByText("trappola sotto il tappeto")).toBeNull();
    expect(screen.queryByRole("button", { name: "Elimina" })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("img", { name: "Visibile ai giocatori" })).toBeNull();
  });

  it("a player with nothing revealed is told there is nothing to see yet", async () => {
    await openWorld(playerWorld, { "GET /api/worlds/w1/tree": [{ status: 200, body: { regions: [] } }] });
    expect(await screen.findByText("Il DM non ha ancora rivelato niente di questo mondo.")).toBeTruthy();
  });

  it("folds and unfolds a branch of the tree", async () => {
    await openWorld(dmWorld, { "GET /api/worlds/w1/tree": [{ status: 200, body: fullTree }] });
    expect(await treeButton("Locanda")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apri o chiudi Foresta" }));
    expect(treeLabel("Locanda")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Apri o chiudi Foresta" }));
    expect(treeLabel("Locanda")).not.toBeNull();
  });

  it("the DM adds a region, the tree reloads and the new region is selected", async () => {
    const server = await openWorld(dmWorld, {
      "GET /api/worlds/w1/tree": [{ status: 200, body: { regions: [] } }, { status: 200, body: { regions: [{ ...el("r9", "Nuovo regno"), areas: [] }] } }],
      "POST /api/worlds/w1/regions": [{ status: 201, body: { element: el("r9", "Nuovo regno") } }],
    });
    fireEvent.change(await screen.findByLabelText("Nuova regione"), { target: { value: "Nuovo regno" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    expect(await screen.findByRole("heading", { name: "Nuovo regno" })).toBeTruthy();
    expect(server.bodies["POST /api/worlds/w1/regions"]).toEqual([{ name: "Nuovo regno" }]);
  });

  it("the DM reveals an element and the change is sent", async () => {
    const server = await openWorld(dmWorld, {
      "GET /api/worlds/w1/tree": [{ status: 200, body: { regions: [{ ...el("r1", "Regno", { revealed: false }), areas: [] }] } }],
      "PATCH /api/worlds/w1/regions/r1": [{ status: 200, body: { element: el("r1", "Regno") } }],
    });
    fireEvent.click(await screen.findByRole("checkbox"));
    await waitFor(() => { expect(server.bodies["PATCH /api/worlds/w1/regions/r1"]).toEqual([{ revealed: true }]); });
  });

  it("the DM edits the name, the description and the notes", async () => {
    const server = await openWorld(dmWorld, {
      "GET /api/worlds/w1/tree": [{ status: 200, body: { regions: [{ ...el("r1", "Regno", { dmNotes: "vecchia nota" }), areas: [] }] } }],
      "PATCH /api/worlds/w1/regions/r1": [{ status: 200, body: { element: el("r1", "Regno antico") } }],
    });
    fireEvent.click(await screen.findByRole("button", { name: "Modifica" }));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Regno antico" } });
    fireEvent.change(screen.getByLabelText("Descrizione (la vedono i giocatori)"), { target: { value: "Molto vecchio" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => { expect(server.bodies["PATCH /api/worlds/w1/regions/r1"]).toEqual([{ name: "Regno antico", description: "Molto vecchio", dmNotes: "vecchia nota" }]); });
  });

  it("shows the server's refusal to delete a non-empty element in Italian", async () => {
    await openWorld(dmWorld, {
      "GET /api/worlds/w1/tree": [{ status: 200, body: { regions: [{ ...el("r1", "Regno"), areas: [] }] } }],
      "DELETE /api/worlds/w1/regions/r1": [{ status: 409, body: { error: "errors.world.not-empty" } }],
    });
    fireEvent.click(await screen.findByRole("button", { name: "Elimina" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Non si può eliminare un elemento che contiene altri elementi.");
  });
});

describe("deleting a scene that has tokens", () => {
  const withoutSala = { regions: [{ ...el("r1", "Regno"), areas: [{ ...el("a1", "Foresta"), places: [{ ...el("p1", "Locanda"), scenes: [el("s2", "Cantina")] }] }] }] };
  const hasTokens = { status: 409, body: { error: "errors.world.scene-has-tokens" } };

  async function startDeleting(extra: Record<string, { status: number; body?: unknown }[]>) {
    const server = await openWorld(dmWorld, { "GET /api/worlds/w1/tree": [{ status: 200, body: fullTree }, { status: 200, body: withoutSala }], ...extra });
    fireEvent.click(await treeButton("Sala"));
    fireEvent.click(await screen.findByRole("button", { name: "Elimina" }));
    return server;
  }

  it("asks first, saying the tokens go with it, and does not delete anything yet", async () => {
    const server = await startDeleting({ "DELETE /api/worlds/w1/scenes/s1": [hasTokens] });
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("Questa scena contiene dei token. Eliminandola vengono eliminati anche loro, e non si può tornare indietro.");
    expect(server.calls.filter((c) => c.startsWith("DELETE"))).toEqual(["DELETE /api/worlds/w1/scenes/s1"]);
    // The refusal is a question, not an error message.
    expect(screen.queryByText("Questa scena contiene dei token: eliminandola vengono eliminati anche loro.")).toBeNull();
  });

  it("deletes the scene and its tokens once the DM confirms, and the scene leaves the tree", async () => {
    const server = await startDeleting({ "DELETE /api/worlds/w1/scenes/s1": [hasTokens], "DELETE /api/worlds/w1/scenes/s1?withTokens=true": [{ status: 204 }] });
    fireEvent.click(await within(await screen.findByRole("alertdialog")).findByRole("button", { name: "Elimina scena e token" }));
    await waitFor(() => { expect(server.calls).toContain("DELETE /api/worlds/w1/scenes/s1?withTokens=true"); });
    await waitFor(() => { expect(treeLabel("Sala")).toBeNull(); });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(treeLabel("Cantina")).not.toBeNull();
  });

  it("leaves the scene alone when the DM changes their mind", async () => {
    const server = await startDeleting({ "DELETE /api/worlds/w1/scenes/s1": [hasTokens] });
    fireEvent.click(await within(await screen.findByRole("alertdialog")).findByRole("button", { name: "Annulla" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(server.calls.filter((c) => c.startsWith("DELETE"))).toHaveLength(1);
    expect(treeLabel("Sala")).not.toBeNull();
  });

  it("a scene without tokens is deleted at once, with no question", async () => {
    const server = await startDeleting({ "DELETE /api/worlds/w1/scenes/s1": [{ status: 204 }] });
    await waitFor(() => { expect(server.calls).toContain("DELETE /api/worlds/w1/scenes/s1"); });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("other refusals are still shown as errors, also after the DM confirmed", async () => {
    // The scene is still there after the refusal, so the tree is the same when it is read again.
    await startDeleting({ "GET /api/worlds/w1/tree": [{ status: 200, body: fullTree }], "DELETE /api/worlds/w1/scenes/s1": [hasTokens], "DELETE /api/worlds/w1/scenes/s1?withTokens=true": [{ status: 409, body: { error: "errors.world.scene-in-use" } }] });
    fireEvent.click(await within(await screen.findByRole("alertdialog")).findByRole("button", { name: "Elimina scena e token" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Questa scena è quella in gioco al tavolo: aprine un'altra prima di eliminarla.");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("exits from a scene", () => {
  const twoLinks = { links: [{ id: "l1", fromSceneId: "s1", toSceneId: "s2", label: "Botola" }] };

  it("lists the exits of the selected scene with the full path of the destination, and adds a new one", async () => {
    const server = await openWorld(dmWorld, {
      "GET /api/worlds/w1/tree": [{ status: 200, body: fullTree }],
      "GET /api/worlds/w1/scene-links": [{ status: 200, body: twoLinks }, { status: 200, body: { links: [...twoLinks.links, { id: "l2", fromSceneId: "s1", toSceneId: "s2", label: "Scala" }] } }],
      "POST /api/worlds/w1/scene-links": [{ status: 201, body: { link: { id: "l2", fromSceneId: "s1", toSceneId: "s2", label: "Scala" } } }],
    });
    fireEvent.click(await treeButton("Sala"));
    const exit = (await screen.findByText("Botola")).closest("li");
    if (exit === null) throw new Error("the exit is not in a list item");
    expect(within(exit).getByText(/Regno › Foresta › Locanda › Cantina/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Scena di arrivo"), { target: { value: "s2" } });
    fireEvent.change(screen.getByLabelText("Nome dell'uscita (facoltativo)"), { target: { value: "Scala" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi uscita" }));
    await waitFor(() => { expect(server.bodies["POST /api/worlds/w1/scene-links"]).toEqual([{ fromSceneId: "s1", toSceneId: "s2", label: "Scala" }]); });
    await waitFor(() => { expect(screen.getAllByRole("button", { name: "Rimuovi" })).toHaveLength(2); });
  });

  it("shows only the exits that start from the selected scene, and cannot lead back to itself", async () => {
    await openWorld(dmWorld, {
      "GET /api/worlds/w1/tree": [{ status: 200, body: fullTree }],
      "GET /api/worlds/w1/scene-links": [{ status: 200, body: twoLinks }],
    });
    fireEvent.click(await treeButton("Cantina"));
    expect(await screen.findByText("Da questa scena non parte nessuna uscita.")).toBeTruthy();
    const options = within(screen.getByLabelText("Scena di arrivo")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Scegli la scena di arrivo", "Regno › Foresta › Locanda › Sala"]);
  });

  it("explains that two scenes are needed", async () => {
    const onlyOne = { regions: [{ ...el("r1", "Regno"), areas: [{ ...el("a1", "Foresta"), places: [{ ...el("p1", "Locanda"), scenes: [el("s1", "Sala")] }] }] }] };
    await openWorld(dmWorld, {
      "GET /api/worlds/w1/tree": [{ status: 200, body: onlyOne }],
      "GET /api/worlds/w1/scene-links": [{ status: 200, body: { links: [] } }],
    });
    fireEvent.click(await treeButton("Sala"));
    expect(await screen.findByText("Servono almeno due scene per creare un'uscita.")).toBeTruthy();
  });

  it("a player never sees exits, and the exits are not even asked for", async () => {
    const server = await openWorld(playerWorld, { "GET /api/worlds/w1/tree": [{ status: 200, body: playerTree }] });
    fireEvent.click(await treeButton("Sala"));
    expect(screen.queryByText("Uscite")).toBeNull();
    expect(server.calls.some((c) => c.includes("scene-links"))).toBe(false);
  });
});

describe("members", () => {
  const members = [{ accountId: "1", username: "Aldo", role: "dm" }, { accountId: "2", username: "Chiara", role: "player" }];

  it("the DM sees everyone, can remove a player and add one by username", async () => {
    const server = await openWorld(dmWorld, {
      "GET /api/worlds/w1/tree": [{ status: 200, body: { regions: [] } }],
      "GET /api/worlds/w1/members": [{ status: 200, body: { members } }],
      "POST /api/worlds/w1/members": [{ status: 201, body: { member: { accountId: "3", username: "Marco", role: "player" } } }],
    });
    fireEvent.click(await screen.findByRole("button", { name: "Membri" }));
    expect(await screen.findByText("Chiara")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Rimuovi" })).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Nome utente da aggiungere"), { target: { value: "Marco" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    await waitFor(() => { expect(server.bodies["POST /api/worlds/w1/members"]).toEqual([{ username: "Marco" }]); });
  });

  it("says in Italian when the username does not exist", async () => {
    await openWorld(dmWorld, {
      "GET /api/worlds/w1/tree": [{ status: 200, body: { regions: [] } }],
      "GET /api/worlds/w1/members": [{ status: 200, body: { members } }],
      "POST /api/worlds/w1/members": [{ status: 404, body: { error: "errors.members.account-not-found" } }],
    });
    fireEvent.click(await screen.findByRole("button", { name: "Membri" }));
    fireEvent.change(await screen.findByLabelText("Nome utente da aggiungere"), { target: { value: "Nessuno" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Non esiste un account con questo nome utente.");
  });

  it("a player sees the members but cannot add or remove", async () => {
    await openWorld(playerWorld, {
      "GET /api/worlds/w1/tree": [{ status: 200, body: { regions: [] } }],
      "GET /api/worlds/w1/members": [{ status: 200, body: { members } }],
    });
    fireEvent.click(await screen.findByRole("button", { name: "Membri" }));
    expect(await screen.findByText("Chiara")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Rimuovi" })).toBeNull();
    expect(screen.queryByLabelText("Nome utente da aggiungere")).toBeNull();
  });
});

describe("sessions", () => {
  const session = (over: Record<string, unknown>) => ({
    id: "x1", title: "La locanda", scheduledAt: null, recommendedLevel: 3, seats: 5, status: "draft", report: "", createdAt: "2026-01-01T00:00:00.000Z", startedAt: null, closedAt: null, ...over,
  });

  it("the DM creates a session and runs it from draft to closed with the chronicle note", async () => {
    const server = await openWorld(dmWorld, {
      "GET /api/worlds/w1/tree": [{ status: 200, body: { regions: [] } }],
      "GET /api/worlds/w1/sessions": [
        { status: 200, body: { sessions: [] } },
        { status: 200, body: { sessions: [session({})] } },
        { status: 200, body: { sessions: [session({ status: "running" })] } },
        { status: 200, body: { sessions: [session({ status: "closed", report: "Il villaggio è salvo." })] } },
      ],
      "POST /api/worlds/w1/sessions": [{ status: 201, body: { session: session({}) } }],
      "POST /api/worlds/w1/sessions/x1/start": [{ status: 200, body: { session: session({ status: "running" }) } }],
      "POST /api/worlds/w1/sessions/x1/close": [{ status: 200, body: { session: session({ status: "closed" }) } }],
    });
    fireEvent.click(await screen.findByRole("button", { name: "Sessioni" }));
    expect(await screen.findByText("Nessuna sessione.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Titolo"), { target: { value: "La locanda" } });
    fireEvent.change(screen.getByLabelText("Livello consigliato"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Posti"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Crea sessione" }));
    expect(await screen.findByText(/Bozza/)).toBeTruthy();
    expect(server.bodies["POST /api/worlds/w1/sessions"]).toEqual([{ title: "La locanda", scheduledAt: null, recommendedLevel: 3, seats: 5 }]);
    fireEvent.click(screen.getByRole("button", { name: "Avvia" }));
    expect(await screen.findByText(/In corso/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Nota di cronaca"), { target: { value: "Il villaggio è salvo." } });
    fireEvent.click(screen.getByRole("button", { name: "Chiudi sessione" }));
    expect(await screen.findByText("Il villaggio è salvo.")).toBeTruthy();
    expect(server.bodies["POST /api/worlds/w1/sessions/x1/close"]).toEqual([{ report: "Il villaggio è salvo." }]);
  });

  it("a player sees the board without any control, and the note of a closed session", async () => {
    await openWorld(playerWorld, {
      "GET /api/worlds/w1/tree": [{ status: 200, body: { regions: [] } }],
      "GET /api/worlds/w1/sessions": [{ status: 200, body: { sessions: [session({ status: "published", title: "Prossima" }), session({ id: "x2", status: "closed", title: "Passata", report: "Cronaca della serata." })] } }],
    });
    fireEvent.click(await screen.findByRole("button", { name: "Sessioni" }));
    expect(await screen.findByText("Prossima")).toBeTruthy();
    expect(screen.getByText("Cronaca della serata.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Avvia" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Crea sessione" })).toBeNull();
  });

  it("the DM saves the chronicle note while the session runs, without closing it", async () => {
    const running = session({ status: "running", report: "A metà serata" });
    const server = await openWorld(dmWorld, {
      "GET /api/worlds/w1/tree": [{ status: 200, body: { regions: [] } }],
      "GET /api/worlds/w1/sessions": [{ status: 200, body: { sessions: [session({ status: "running" })] } }, { status: 200, body: { sessions: [running] } }],
      "PUT /api/worlds/w1/sessions/x1/report": [{ status: 200, body: { session: running } }],
    });
    fireEvent.click(await screen.findByRole("button", { name: "Sessioni" }));
    fireEvent.change(await screen.findByLabelText("Nota di cronaca"), { target: { value: "A metà serata" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva nota" }));
    await waitFor(() => { expect(server.bodies["PUT /api/worlds/w1/sessions/x1/report"]).toEqual([{ report: "A metà serata" }]); });
    expect(server.calls).not.toContain("POST /api/worlds/w1/sessions/x1/close");
  });

  it("the DM can still correct the note after the session is closed", async () => {
    const closed = session({ status: "closed", report: "Prima versione" });
    const server = await openWorld(dmWorld, {
      "GET /api/worlds/w1/tree": [{ status: 200, body: { regions: [] } }],
      "GET /api/worlds/w1/sessions": [{ status: 200, body: { sessions: [closed] } }],
      "PUT /api/worlds/w1/sessions/x1/report": [{ status: 200, body: { session: { ...closed, report: "Corretta" } } }],
    });
    fireEvent.click(await screen.findByRole("button", { name: "Sessioni" }));
    await screen.findByLabelText("Nota di cronaca");
    expect(fieldAt("Nota di cronaca").value).toBe("Prima versione");
    fireEvent.change(fieldAt("Nota di cronaca"), { target: { value: "Corretta" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva nota" }));
    await waitFor(() => { expect(server.bodies["PUT /api/worlds/w1/sessions/x1/report"]).toEqual([{ report: "Corretta" }]); });
    expect(screen.queryByRole("button", { name: "Modifica" })).toBeNull();
  });

  it("the DM edits the details of a published session", async () => {
    const published = session({ status: "published", scheduledAt: new Date(2026, 11, 1, 18, 30).toISOString() });
    const server = await openWorld(dmWorld, {
      "GET /api/worlds/w1/tree": [{ status: 200, body: { regions: [] } }],
      "GET /api/worlds/w1/sessions": [{ status: 200, body: { sessions: [published] } }, { status: 200, body: { sessions: [{ ...published, title: "Nuovo titolo", seats: 6 }] } }],
      "PATCH /api/worlds/w1/sessions/x1": [{ status: 200, body: { session: { ...published, title: "Nuovo titolo", seats: 6 } } }],
    });
    fireEvent.click(await screen.findByRole("button", { name: "Sessioni" }));
    fireEvent.click(await screen.findByRole("button", { name: "Modifica" }));
    expect(fieldAt("Titolo").value).toBe("La locanda");
    expect(fieldAt("Data e ora").value).toBe("2026-12-01T18:30");
    fireEvent.change(fieldAt("Titolo"), { target: { value: "Nuovo titolo" } });
    fireEvent.change(fieldAt("Posti"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => { expect(server.bodies["PATCH /api/worlds/w1/sessions/x1"]).toEqual([{ title: "Nuovo titolo", scheduledAt: new Date(2026, 11, 1, 18, 30).toISOString(), recommendedLevel: 3, seats: 6 }]); });
    expect(await screen.findByText("Nuovo titolo")).toBeTruthy();
  });

  it("clearing the date and level sends them as empty", async () => {
    const server = await openWorld(dmWorld, {
      "GET /api/worlds/w1/tree": [{ status: 200, body: { regions: [] } }],
      "GET /api/worlds/w1/sessions": [{ status: 200, body: { sessions: [session({ status: "draft", scheduledAt: new Date(2026, 11, 1, 18, 30).toISOString() })] } }],
      "PATCH /api/worlds/w1/sessions/x1": [{ status: 200, body: { session: session({ status: "draft" }) } }],
    });
    fireEvent.click(await screen.findByRole("button", { name: "Sessioni" }));
    fireEvent.click(await screen.findByRole("button", { name: "Modifica" }));
    fireEvent.change(fieldAt("Data e ora"), { target: { value: "" } });
    fireEvent.change(fieldAt("Livello consigliato"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => { expect(server.bodies["PATCH /api/worlds/w1/sessions/x1"]).toEqual([{ title: "La locanda", scheduledAt: null, recommendedLevel: null, seats: 5 }]); });
  });

  it("a player reads the chronicle note while the session is still running", async () => {
    await openWorld(playerWorld, {
      "GET /api/worlds/w1/tree": [{ status: 200, body: { regions: [] } }],
      "GET /api/worlds/w1/sessions": [{ status: 200, body: { sessions: [session({ status: "running", title: "In corso", report: "Il gruppo è arrivato alla locanda." })] } }],
    });
    fireEvent.click(await screen.findByRole("button", { name: "Sessioni" }));
    expect(await screen.findByText("Il gruppo è arrivato alla locanda.")).toBeTruthy();
  });

  it("shows the refusal to start a second session in Italian", async () => {
    await openWorld(dmWorld, {
      "GET /api/worlds/w1/tree": [{ status: 200, body: { regions: [] } }],
      "GET /api/worlds/w1/sessions": [{ status: 200, body: { sessions: [session({ status: "published" })] } }],
      "POST /api/worlds/w1/sessions/x1/start": [{ status: 409, body: { error: "errors.session.already-running" } }],
    });
    fireEvent.click(await screen.findByRole("button", { name: "Sessioni" }));
    fireEvent.click(await screen.findByRole("button", { name: "Avvia" }));
    const alert = await screen.findByRole("alert");
    expect(within(alert.closest("li") ?? alert).getByText("In questo mondo c'è già una sessione in corso.")).toBeTruthy();
  });
});
