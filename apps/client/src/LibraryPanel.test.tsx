// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { TableCommand } from "@phoenix/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LibraryPanel } from "./LibraryPanel";
import { scene, token } from "./table/fixtures";
import { buttonNamed, fakeServer, inputLabelled } from "./test-helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const entry = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, color: "green", size: 1, imageId: null, ...extra });
const list = (...tokens: unknown[]) => ({ status: 200, body: { tokens } });
type Routes = Record<string, { status: number; body?: unknown }[]>;

function setup(routes: Routes, over: { tokens?: Parameters<typeof LibraryPanel>[0]["tokens"]; send?: (c: TableCommand) => boolean } = {}) {
  const server = fakeServer(routes);
  const send = vi.fn(over.send ?? (() => true));
  render(<LibraryPanel worldId="w1" scene={scene} tokens={over.tokens ?? []} send={send} />);
  return { server, send };
}

describe("the library of tokens", () => {
  it("lists what the DM loaded, with its size, and says so when it is empty", async () => {
    setup({ "GET /api/worlds/w1/token-library": [list(entry("e1", "Goblin"), entry("e2", "Drago", { size: 4 }))] });
    const rows = await screen.findAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining("Goblin"), expect.stringContaining("Drago")]);
    expect(rows[1]?.textContent).toContain("4");
    cleanup();
    setup({ "GET /api/worlds/w1/token-library": [list()] });
    expect(await screen.findByText("La libreria è vuota: carica il primo token.")).toBeTruthy();
  });

  it("says that what is put on a scene is a copy", async () => {
    setup({ "GET /api/worlds/w1/token-library": [list(entry("e1", "Goblin"))] });
    expect(await screen.findByText(/sono copie/)).toBeTruthy();
  });

  it("puts a copy on the scene in the first free square of the start zone, with what the entry has", async () => {
    const { send } = setup({ "GET /api/worlds/w1/token-library": [list(entry("e1", "Goblin", { color: "red", size: 2, imageId: "img1" }))] });
    fireEvent.click(await screen.findByRole("button", { name: "Aggiungi Goblin alla scena" }));
    expect(send).toHaveBeenCalledWith({ type: "token.add", kind: "token", label: "Goblin", color: "red", x: 2, y: 2, size: 2, hidden: false, travels: false, ownerAccountId: null, imageId: "img1" });
  });

  it("each copy goes to a square that is free: the second does not land on the first", async () => {
    const { send } = setup({ "GET /api/worlds/w1/token-library": [list(entry("e1", "Goblin"))] }, { tokens: [token("t1", { x: 2, y: 2 })] });
    fireEvent.click(await screen.findByRole("button", { name: "Aggiungi Goblin alla scena" }));
    const added = send.mock.calls[0]?.[0];
    expect(added).toMatchObject({ type: "token.add" });
    expect(added !== undefined && "x" in added && `${String(added.x)},${String(added.y)}`).not.toBe("2,2");
  });

  it("two copies put one after the other before the table answers do not go to the same square", async () => {
    const { send } = setup({ "GET /api/worlds/w1/token-library": [list(entry("e1", "Goblin"))] });
    const add = await screen.findByRole("button", { name: "Aggiungi Goblin alla scena" });
    fireEvent.click(add);
    fireEvent.click(add);
    fireEvent.click(add);
    const places = send.mock.calls.map(([c]) => (c.type === "token.add" ? `${String(c.x)},${String(c.y)}` : ""));
    expect(new Set(places).size).toBe(3);
  });

  it("a copy the table has already answered is not counted twice", async () => {
    fakeServer({ "GET /api/worlds/w1/token-library": [list(entry("e1", "Goblin"))] });
    const sent: TableCommand[] = [];
    const send = (command: TableCommand): boolean => {
      sent.push(command);
      return true;
    };
    const { rerender } = render(<LibraryPanel worldId="w1" scene={scene} tokens={[]} send={send} />);
    const add = await screen.findByRole("button", { name: "Aggiungi Goblin alla scena" });
    fireEvent.click(add);
    const spots = (): string[] => sent.flatMap((c) => (c.type === "token.add" ? [`${String(c.x)},${String(c.y)}`] : []));
    const [x, y] = (spots()[0] ?? "-1,-1").split(",").map(Number);
    // The table answers: the copy is on the scene now, where it was asked to be.
    rerender(<LibraryPanel worldId="w1" scene={scene} tokens={[token("t1", { x: x ?? -1, y: y ?? -1 })]} send={send} />);
    fireEvent.click(add);
    fireEvent.click(add);
    expect(new Set(spots()).size).toBe(3);
  });

  it("can put them on the scene hidden from the players", async () => {
    const { send } = setup({ "GET /api/worlds/w1/token-library": [list(entry("e1", "Goblin"))] });
    fireEvent.click(await screen.findByLabelText("Aggiungi nascosti"));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi Goblin alla scena" }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ hidden: true }));
  });

  it("the same entry can be put on again and again", async () => {
    const { send } = setup({ "GET /api/worlds/w1/token-library": [list(entry("e1", "Goblin"))] });
    const add = await screen.findByRole("button", { name: "Aggiungi Goblin alla scena" });
    fireEvent.click(add);
    fireEvent.click(add);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe("loading a token into the library", () => {
  it("is done once, with a name, a colour and a size, and then it is in the list", async () => {
    const { server } = setup({
      "GET /api/worlds/w1/token-library": [list(), list(entry("e9", "Orco", { color: "blue", size: 2 }))],
      "POST /api/worlds/w1/token-library": [{ status: 201, body: { token: entry("e9", "Orco", { color: "blue", size: 2 }) } }],
    });
    await screen.findByText("La libreria è vuota: carica il primo token.");
    fireEvent.change(inputLabelled("Nome"), { target: { value: "Orco" } });
    fireEvent.change(screen.getByLabelText("Colore"), { target: { value: "blue" } });
    fireEvent.change(screen.getByLabelText("Dimensione in quadretti"), { target: { value: "2" } });
    fireEvent.click(buttonNamed("Aggiungi alla libreria"));
    expect(await screen.findByRole("button", { name: "Aggiungi Orco alla scena" })).toBeTruthy();
    expect(server.bodies["POST /api/worlds/w1/token-library"]).toEqual([{ name: "Orco", color: "blue", size: 2, imageId: null }]);
    expect(inputLabelled("Nome").value).toBe("");
  });

  it("can have a picture: it is uploaded first and its id goes with the entry", async () => {
    const { server } = setup({
      "GET /api/worlds/w1/token-library": [list(), list()],
      "POST /api/worlds/w1/images?kind=token": [{ status: 201, body: { image: { id: "img7", kind: "token", width: 100, height: 100 } } }],
      "POST /api/worlds/w1/token-library": [{ status: 201, body: { token: entry("e9", "Orco", { imageId: "img7" }) } }],
    });
    await screen.findByText("La libreria è vuota: carica il primo token.");
    fireEvent.change(inputLabelled("Nome"), { target: { value: "Orco" } });
    fireEvent.change(screen.getByLabelText("Immagine del token"), { target: { files: [new File(["x"], "orco.png", { type: "image/png" })] } });
    await waitFor(() => { expect(server.calls).toContain("POST /api/worlds/w1/images?kind=token"); });
    await screen.findByText("Immagine caricata ✓");
    fireEvent.click(buttonNamed("Aggiungi alla libreria"));
    await waitFor(() => { expect(server.bodies["POST /api/worlds/w1/token-library"]).toEqual([{ name: "Orco", color: "gold", size: 1, imageId: "img7" }]); });
  });

  it("needs a name", async () => {
    const { server } = setup({ "GET /api/worlds/w1/token-library": [list()] });
    await screen.findByText("La libreria è vuota: carica il primo token.");
    fireEvent.click(buttonNamed("Aggiungi alla libreria"));
    expect(server.calls.filter((c) => c.startsWith("POST"))).toEqual([]);
  });

  it("says why when the server refuses", async () => {
    setup({ "GET /api/worlds/w1/token-library": [list()], "POST /api/worlds/w1/token-library": [{ status: 400, body: { error: "errors.world.picture-invalid" } }] });
    await screen.findByText("La libreria è vuota: carica il primo token.");
    fireEvent.change(inputLabelled("Nome"), { target: { value: "Orco" } });
    fireEvent.click(buttonNamed("Aggiungi alla libreria"));
    expect((await screen.findByRole("alert")).textContent).toBe("L'immagine indicata non esiste in questo mondo o non è un'immagine di token.");
  });
});

describe("changing and removing what is in the library", () => {
  it("an entry is changed in place, and the list shows it", async () => {
    const { server } = setup({
      "GET /api/worlds/w1/token-library": [list(entry("e1", "Goblin")), list(entry("e1", "Goblin capo", { size: 2 }))],
      "PATCH /api/worlds/w1/token-library/e1": [{ status: 200, body: { token: entry("e1", "Goblin capo", { size: 2 }) } }],
    });
    fireEvent.click(await screen.findByRole("button", { name: "Modifica Goblin" }));
    const form = screen.getByRole("form", { name: "Modifica Goblin" });
    fireEvent.change(within(form).getByLabelText("Nome"), { target: { value: "Goblin capo" } });
    fireEvent.change(within(form).getByLabelText("Dimensione in quadretti"), { target: { value: "2" } });
    fireEvent.click(within(form).getByRole("button", { name: "Salva" }));
    expect(await screen.findByRole("button", { name: "Aggiungi Goblin capo alla scena" })).toBeTruthy();
    expect(server.bodies["PATCH /api/worlds/w1/token-library/e1"]).toEqual([{ name: "Goblin capo", color: "green", size: 2 }]);
  });

  it("an entry that has a picture offers to take it away, and saving then sends that", async () => {
    const { server } = setup({
      "GET /api/worlds/w1/token-library": [list(entry("e1", "Goblin", { imageId: "img1" })), list(entry("e1", "Goblin"))],
      "PATCH /api/worlds/w1/token-library/e1": [{ status: 200, body: { token: entry("e1", "Goblin") } }],
    });
    fireEvent.click(await screen.findByRole("button", { name: "Modifica Goblin" }));
    const form = screen.getByRole("form", { name: "Modifica Goblin" });
    fireEvent.click(within(form).getByRole("button", { name: "Togli l'immagine" }));
    expect(within(form).queryByRole("button", { name: "Togli l'immagine" })).toBeNull();
    fireEvent.click(within(form).getByRole("button", { name: "Salva" }));
    await waitFor(() => { expect(server.bodies["PATCH /api/worlds/w1/token-library/e1"]).toEqual([{ name: "Goblin", color: "green", size: 1, imageId: null }]); });
  });

  it("an entry without a picture has nothing to take away", async () => {
    setup({ "GET /api/worlds/w1/token-library": [list(entry("e1", "Goblin"))] });
    fireEvent.click(await screen.findByRole("button", { name: "Modifica Goblin" }));
    expect(screen.queryByRole("button", { name: "Togli l'immagine" })).toBeNull();
  });

  it("giving up a change leaves the entry as it was", async () => {
    const { server } = setup({ "GET /api/worlds/w1/token-library": [list(entry("e1", "Goblin"))] });
    fireEvent.click(await screen.findByRole("button", { name: "Modifica Goblin" }));
    fireEvent.click(within(screen.getByRole("form", { name: "Modifica Goblin" })).getByRole("button", { name: "Annulla" }));
    expect(screen.queryByRole("form", { name: "Modifica Goblin" })).toBeNull();
    expect(server.calls.filter((c) => c.startsWith("PATCH"))).toEqual([]);
  });

  it("an entry is taken out of the library, and the list no longer has it", async () => {
    const { server } = setup({
      "GET /api/worlds/w1/token-library": [list(entry("e1", "Goblin")), list()],
      "DELETE /api/worlds/w1/token-library/e1": [{ status: 204 }],
    });
    fireEvent.click(await screen.findByRole("button", { name: "Elimina Goblin dalla libreria" }));
    expect(await screen.findByText("La libreria è vuota: carica il primo token.")).toBeTruthy();
    expect(server.calls).toContain("DELETE /api/worlds/w1/token-library/e1");
  });

  it("says why when it cannot be removed", async () => {
    setup({ "GET /api/worlds/w1/token-library": [list(entry("e1", "Goblin"))], "DELETE /api/worlds/w1/token-library/e1": [{ status: 404, body: { error: "errors.not-found" } }] });
    fireEvent.click(await screen.findByRole("button", { name: "Elimina Goblin dalla libreria" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Elemento non trovato.");
  });

  it("says when the library cannot be read", async () => {
    setup({ "GET /api/worlds/w1/token-library": [{ status: 500 }] });
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});
