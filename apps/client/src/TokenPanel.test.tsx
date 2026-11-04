// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TokenDetailsPanel, TokensPanel } from "./TokenPanel";
import { dm, people, player, scene, token } from "./table/fixtures";
import type { Me } from "./table/state";
import { fakeServer, inputLabelled } from "./test-helpers";
import type { TokenView } from "@phoenix/shared";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function list(me: Me, tokens: TokenView[], selected: string[] = []) {
  const send = vi.fn(() => true);
  const onSelect = vi.fn();
  render(<TokensPanel worldId="w1" scene={scene} me={me} tokens={tokens} selectedIds={new Set(selected)} onSelect={onSelect} people={people} send={send} />);
  return { send, onSelect };
}

function details(me: Me, tk: TokenView) {
  const send = vi.fn(() => true);
  const onClose = vi.fn();
  render(<TokenDetailsPanel token={tk} worldId="w1" me={me} people={people} send={send} onClose={onClose} />);
  return { send, onClose };
}

const own = token("t-own", { label: "Aldric", ownerAccountId: "anna", x: 3, y: 4 });
const other = token("t-other", { label: "Goblin", color: "red", x: 1, y: 1 });
const secret = token("t-secret", { label: "Imboscata", hidden: true });
const note = token("t-note", { kind: "text", label: "La botola è sotto il tappeto", x: 5, y: 5 });

describe("the list of tokens", () => {
  it("lists them, marks the player's own, and picks one on click", () => {
    const { onSelect } = list(player, [own, other]);
    const items = screen.getByRole("list", { name: "Token in scena" });
    expect(within(items).getByText("Tuo")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Seleziona Goblin" }));
    expect(onSelect).toHaveBeenCalledWith("t-other");
  });

  it("marks what is selected", () => {
    list(player, [own, other], ["t-other"]);
    expect(screen.getByRole("button", { name: "Seleziona Goblin" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("button", { name: "Seleziona Aldric" }).getAttribute("aria-current")).toBeNull();
  });

  it("lists a text like any token", () => {
    list(dm, [note]);
    expect(screen.getByRole("button", { name: "Seleziona La botola è sotto il tappeto" })).toBeTruthy();
  });

  it("says when the scene is empty", () => {
    list(player, []);
    expect(screen.getByText("Nessun token in scena.")).toBeTruthy();
  });

  it("a player has no form to add tokens; the DM has one, and sees what is hidden", () => {
    list(player, [secret]);
    expect(screen.queryByRole("button", { name: "Aggiungi token" })).toBeNull();
    cleanup();
    list(dm, [secret]);
    expect(screen.getByRole("button", { name: "Aggiungi token" })).toBeTruthy();
  });

  it("adds a token in the first free square of the start zone", () => {
    const { send } = list(dm, [token("x", { x: 2, y: 2 })]);
    const form = screen.getByRole("textbox", { name: "Nome" }).closest("form");
    if (form === null) throw new Error("no form");
    fireEvent.change(screen.getByRole("textbox", { name: "Nome" }), { target: { value: "  Orco  " } });
    fireEvent.change(within(form).getByLabelText("Colore"), { target: { value: "green" } });
    fireEvent.change(within(form).getByLabelText("Appartiene a"), { target: { value: "bruno" } });
    fireEvent.click(within(form).getByLabelText("Nascosto ai giocatori"));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi token" }));
    expect(send).toHaveBeenCalledWith({ type: "token.add", kind: "token", label: "Orco", color: "green", x: 3, y: 2, size: 1, hidden: true, travels: false, ownerAccountId: "bruno", imageId: null });
    expect(inputLabelled("Nome").value).toBe("");
  });

  it("starts the next token clean: owner, hidden and following the group do not carry over", () => {
    const { send } = list(dm, []);
    const name = (): HTMLInputElement => inputLabelled("Nome");
    fireEvent.change(name(), { target: { value: "Aldric" } });
    fireEvent.change(screen.getByLabelText("Appartiene a"), { target: { value: "anna" } });
    fireEvent.click(screen.getByLabelText("Nascosto ai giocatori"));
    fireEvent.click(screen.getByLabelText("Segue il gruppo quando cambia scena"));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi token" }));
    fireEvent.change(name(), { target: { value: "Goblin" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi token" }));
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ label: "Goblin", ownerAccountId: null, hidden: false, travels: false, imageId: null }));
  });

  it("adds nothing without a name", () => {
    const { send } = list(dm, []);
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi token" }));
    expect(send).not.toHaveBeenCalled();
  });

  it("uploads a picture for the new token and sends its id", async () => {
    const server = fakeServer({ "POST /api/worlds/w1/images?kind=token": [{ status: 201, body: { image: { id: "11111111-1111-4111-8111-111111111111", kind: "token", width: 64, height: 64 } } }] });
    const { send } = list(dm, []);
    fireEvent.change(screen.getByLabelText("Immagine del token"), { target: { files: [new File([new Uint8Array([1, 2, 3])], "volto.png", { type: "image/png" })] } });
    await waitFor(() => { expect(server.calls).toContain("POST /api/worlds/w1/images?kind=token"); });
    await screen.findByText("Immagine del token ✓");
    fireEvent.change(screen.getByRole("textbox", { name: "Nome" }), { target: { value: "Elfo" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi token" }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: "token.add", label: "Elfo", imageId: "11111111-1111-4111-8111-111111111111" }));
  });

  it("shows the error when the picture is refused", async () => {
    fakeServer({ "POST /api/worlds/w1/images?kind=token": [{ status: 400, body: { error: "errors.image.invalid" } }] });
    list(dm, []);
    fireEvent.change(screen.getByLabelText("Immagine del token"), { target: { files: [new File([new Uint8Array([1])], "x.png", { type: "image/png" })] } });
    expect(await screen.findByText("Il file non è un'immagine PNG, JPEG o WebP valida.")).toBeTruthy();
  });
});

describe("the details of a token", () => {
  it("shows the name and the square, and a player moves their own token with the arrows", () => {
    const { send } = details(player, own);
    expect(screen.getByText("Quadretto 3, 4")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sposta a destra" }));
    fireEvent.click(screen.getByRole("button", { name: "Sposta su" }));
    expect(send).toHaveBeenNthCalledWith(1, { type: "token.move", tokenId: "t-own", x: 4, y: 4 });
    expect(send).toHaveBeenNthCalledWith(2, { type: "token.move", tokenId: "t-own", x: 3, y: 3 });
  });

  it("has no arrows for someone else's token and none of the DM's tools", () => {
    details(player, other);
    for (const name of ["Sposta giù", "Rimuovi dal tavolo", "Nascondi", "Rinomina"]) expect(screen.queryByRole("button", { name })).toBeNull();
  });

  it("the DM moves any token", () => {
    const { send } = details(dm, other);
    fireEvent.click(screen.getByRole("button", { name: "Sposta giù" }));
    expect(send).toHaveBeenCalledWith({ type: "token.move", tokenId: "t-other", x: 1, y: 2 });
  });

  it("the DM hides or shows the token", () => {
    const hidden = details(dm, secret);
    fireEvent.click(screen.getByRole("button", { name: "Mostra" }));
    expect(hidden.send).toHaveBeenCalledWith({ type: "token.update", tokenId: "t-secret", hidden: false });
    cleanup();
    const shown = details(dm, other);
    fireEvent.click(screen.getByRole("button", { name: "Nascondi" }));
    expect(shown.send).toHaveBeenCalledWith({ type: "token.update", tokenId: "t-other", hidden: true });
  });

  it("changes color, size, owner and whether it follows the group", () => {
    const { send } = details(dm, other);
    const panel = screen.getByRole("region", { name: "Token selezionato" });
    fireEvent.change(within(panel).getByLabelText("Colore"), { target: { value: "blue" } });
    expect(send).toHaveBeenLastCalledWith({ type: "token.update", tokenId: "t-other", color: "blue" });
    fireEvent.change(within(panel).getByLabelText("Dimensione in quadretti"), { target: { value: "3" } });
    expect(send).toHaveBeenLastCalledWith({ type: "token.update", tokenId: "t-other", size: 3 });
    fireEvent.change(within(panel).getByLabelText("Appartiene a"), { target: { value: "bruno" } });
    expect(send).toHaveBeenLastCalledWith({ type: "token.update", tokenId: "t-other", ownerAccountId: "bruno" });
    fireEvent.change(within(panel).getByLabelText("Appartiene a"), { target: { value: "" } });
    expect(send).toHaveBeenLastCalledWith({ type: "token.update", tokenId: "t-other", ownerAccountId: null });
    fireEvent.click(within(panel).getByLabelText("Segue il gruppo quando cambia scena"));
    expect(send).toHaveBeenLastCalledWith({ type: "token.update", tokenId: "t-other", travels: true });
  });

  it("renames, but only to something new", () => {
    const { send } = details(dm, other);
    fireEvent.click(screen.getByRole("button", { name: "Rinomina" }));
    expect(send).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "  Orco capo  " } });
    fireEvent.click(screen.getByRole("button", { name: "Rinomina" }));
    expect(send).toHaveBeenCalledWith({ type: "token.update", tokenId: "t-other", label: "Orco capo" });
  });

  it("a text has a name and visibility but no color, size, owner or picture", () => {
    details(dm, note);
    expect(screen.getByLabelText("Nome")).toBeTruthy();
    for (const label of ["Colore", "Dimensione in quadretti", "Appartiene a", "Immagine del token"]) expect(screen.queryByLabelText(label)).toBeNull();
    expect(screen.getByRole("button", { name: "Nascondi" })).toBeTruthy();
  });

  it("removes the token and closes the panel", () => {
    const { send, onClose } = details(dm, other);
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi dal tavolo" }));
    expect(send).toHaveBeenCalledWith({ type: "token.remove", tokenId: "t-other" });
    expect(onClose).toHaveBeenCalled();
  });

  it("changes the picture of a token", async () => {
    fakeServer({ "POST /api/worlds/w1/images?kind=token": [{ status: 201, body: { image: { id: "33333333-3333-4333-8333-333333333333", kind: "token", width: 64, height: 64 } } }] });
    const { send } = details(dm, other);
    fireEvent.change(screen.getByLabelText("Immagine del token"), { target: { files: [new File([new Uint8Array([1])], "x.png", { type: "image/png" })] } });
    await waitFor(() => { expect(send).toHaveBeenCalledWith({ type: "token.update", tokenId: "t-other", imageId: "33333333-3333-4333-8333-333333333333" }); });
  });
});

describe("texts and the squares", () => {
  it("a text lying in the start zone does not keep a new token out of it", () => {
    const { send } = list(dm, [token("n", { kind: "text", label: "Nota", x: 2, y: 2 })]);
    fireEvent.change(screen.getByRole("textbox", { name: "Nome" }), { target: { value: "Orco" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi token" }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: "token.add", kind: "token", label: "Orco", x: 2, y: 2 }));
  });

  it("a text has no 'follows the group' switch, since it never travels", () => {
    details(dm, note);
    expect(screen.queryByLabelText("Segue il gruppo quando cambia scena")).toBeNull();
    cleanup();
    details(dm, other);
    expect(screen.getByLabelText("Segue il gruppo quando cambia scena")).toBeTruthy();
  });
});

describe("writing a text from the list, without the mouse", () => {
  it("is for the DM only", () => {
    list(player, []);
    expect(screen.queryByText("Nuovo testo sulla mappa")).toBeNull();
  });

  it("writes it in the first free square of the start zone, as a text", () => {
    const { send } = list(dm, [token("x", { x: 2, y: 2 })]);
    const field = inputLabelled("Testo da scrivere sulla mappa");
    fireEvent.change(field, { target: { value: "  Qui c'è una botola  " } });
    fireEvent.click(screen.getByRole("button", { name: "Scrivi sulla mappa" }));
    expect(send).toHaveBeenCalledWith({ type: "token.add", kind: "text", label: "Qui c'è una botola", color: "gold", x: 3, y: 2, size: 1, hidden: false, travels: false, ownerAccountId: null, imageId: null });
    expect(field.value).toBe("");
  });

  it("writes nothing for an empty text, and keeps the words when the line is down", () => {
    const send = vi.fn(() => false);
    render(<TokensPanel worldId="w1" scene={scene} me={dm} tokens={[]} selectedIds={new Set()} onSelect={vi.fn()} people={people} send={send} />);
    fireEvent.click(screen.getByRole("button", { name: "Scrivi sulla mappa" }));
    expect(send).not.toHaveBeenCalled();
    const field = inputLabelled("Testo da scrivere sulla mappa");
    fireEvent.change(field, { target: { value: "Ci sei?" } });
    fireEvent.click(screen.getByRole("button", { name: "Scrivi sulla mappa" }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(field.value).toBe("Ci sei?");
  });
});
