// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TokenPanel } from "./TokenPanel";
import { dm, people, player, scene, token } from "./table/fixtures";
import type { Me } from "./table/state";
import { fakeServer, inputLabelled } from "./test-helpers";
import type { TokenView } from "@phoenix/shared";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup(me: Me, tokens: TokenView[], selectedId: string | null = null) {
  const send = vi.fn(() => true);
  const onSelect = vi.fn();
  render(<TokenPanel worldId="w1" scene={scene} me={me} tokens={tokens} selectedId={selectedId} onSelect={onSelect} people={people} send={send} />);
  return { send, onSelect };
}

const own = token("t-own", { label: "Aldric", ownerAccountId: "anna", x: 3, y: 4 });
const other = token("t-other", { label: "Goblin", color: "red", x: 1, y: 1 });
const secret = token("t-secret", { label: "Imboscata", hidden: true });

describe("TokenPanel as a player", () => {
  it("lists the tokens, marks the player's own, and picks one on click", () => {
    const { onSelect } = setup(player, [own, other]);
    const list = screen.getByRole("list", { name: "Token in scena" });
    expect(within(list).getByText("Tuo")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Seleziona Goblin" }));
    expect(onSelect).toHaveBeenCalledWith("t-other");
  });

  it("moves their own token one square with the arrows", () => {
    const { send } = setup(player, [own, other], "t-own");
    expect(screen.getByText("Quadretto 3, 4")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sposta a destra" }));
    fireEvent.click(screen.getByRole("button", { name: "Sposta su" }));
    expect(send).toHaveBeenNthCalledWith(1, { type: "token.move", tokenId: "t-own", x: 4, y: 4 });
    expect(send).toHaveBeenNthCalledWith(2, { type: "token.move", tokenId: "t-own", x: 3, y: 3 });
  });

  it("has no arrows for someone else's token and none of the DM's tools", () => {
    setup(player, [own, other], "t-other");
    expect(screen.queryByRole("button", { name: "Sposta giù" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rimuovi dal tavolo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Aggiungi token" })).toBeNull();
  });

  it("asks to pick a token when none is picked, and says when the scene is empty", () => {
    setup(player, [], null);
    expect(screen.getByText("Nessun token in scena.")).toBeTruthy();
    expect(screen.getByText("Seleziona un token sulla mappa o dall'elenco.")).toBeTruthy();
  });
});

describe("TokenPanel as the DM", () => {
  it("moves any token", () => {
    const { send } = setup(dm, [other], "t-other");
    fireEvent.click(screen.getByRole("button", { name: "Sposta giù" }));
    expect(send).toHaveBeenCalledWith({ type: "token.move", tokenId: "t-other", x: 1, y: 2 });
  });

  it("shows which tokens the players can see, and hides or shows the picked one", () => {
    const { send } = setup(dm, [other, secret], "t-secret");
    expect(screen.getAllByText("Nascosto ai giocatori").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Mostra" }));
    expect(send).toHaveBeenCalledWith({ type: "token.update", tokenId: "t-secret", hidden: false });
    cleanup();
    const again = setup(dm, [other], "t-other");
    fireEvent.click(screen.getByRole("button", { name: "Nascondi" }));
    expect(again.send).toHaveBeenCalledWith({ type: "token.update", tokenId: "t-other", hidden: true });
  });

  it("changes color, size, owner and whether it follows the group", () => {
    const { send } = setup(dm, [other], "t-other");
    const detail = screen.getByRole("region", { name: "Token selezionato" });
    fireEvent.change(within(detail).getByLabelText("Colore"), { target: { value: "blue" } });
    expect(send).toHaveBeenLastCalledWith({ type: "token.update", tokenId: "t-other", color: "blue" });
    fireEvent.change(within(detail).getByLabelText("Dimensione in quadretti"), { target: { value: "3" } });
    expect(send).toHaveBeenLastCalledWith({ type: "token.update", tokenId: "t-other", size: 3 });
    fireEvent.change(within(detail).getByLabelText("Appartiene a"), { target: { value: "bruno" } });
    expect(send).toHaveBeenLastCalledWith({ type: "token.update", tokenId: "t-other", ownerAccountId: "bruno" });
    fireEvent.change(within(detail).getByLabelText("Appartiene a"), { target: { value: "" } });
    expect(send).toHaveBeenLastCalledWith({ type: "token.update", tokenId: "t-other", ownerAccountId: null });
    fireEvent.click(within(detail).getByLabelText("Segue il gruppo quando cambia scena"));
    expect(send).toHaveBeenLastCalledWith({ type: "token.update", tokenId: "t-other", travels: true });
  });

  it("removes the picked token and lets go of the selection", () => {
    const { send, onSelect } = setup(dm, [other], "t-other");
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi dal tavolo" }));
    expect(send).toHaveBeenCalledWith({ type: "token.remove", tokenId: "t-other" });
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("adds a token in the first free square of the start zone", () => {
    const { send } = setup(dm, [token("x", { x: 2, y: 2 })]);
    const form = screen.getByRole("textbox", { name: "Nome" }).closest("form");
    if (form === null) throw new Error("no form");
    fireEvent.change(screen.getByRole("textbox", { name: "Nome" }), { target: { value: "  Orco  " } });
    fireEvent.change(within(form).getByLabelText("Colore"), { target: { value: "green" } });
    fireEvent.change(within(form).getByLabelText("Appartiene a"), { target: { value: "bruno" } });
    fireEvent.click(within(form).getByLabelText("Nascosto ai giocatori"));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi token" }));
    expect(send).toHaveBeenCalledWith({ type: "token.add", label: "Orco", color: "green", x: 3, y: 2, size: 1, hidden: true, travels: false, ownerAccountId: "bruno", imageId: null });
    expect(inputLabelled("Nome").value).toBe("");
  });

  it("starts the next token clean: owner, hidden and following the group do not carry over", () => {
    const { send } = setup(dm, []);
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
    const { send } = setup(dm, []);
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi token" }));
    expect(send).not.toHaveBeenCalled();
  });

  it("uploads a picture for the new token and sends its id", async () => {
    const server = fakeServer({ "POST /api/worlds/w1/images?kind=token": [{ status: 201, body: { image: { id: "11111111-1111-4111-8111-111111111111", kind: "token", width: 64, height: 64 } } }] });
    const { send } = setup(dm, []);
    const file = new File([new Uint8Array([1, 2, 3])], "volto.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Immagine del token"), { target: { files: [file] } });
    await waitFor(() => { expect(server.calls).toContain("POST /api/worlds/w1/images?kind=token"); });
    await screen.findByText("Immagine del token ✓");
    fireEvent.change(screen.getByRole("textbox", { name: "Nome" }), { target: { value: "Elfo" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi token" }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: "token.add", label: "Elfo", imageId: "11111111-1111-4111-8111-111111111111" }));
  });

  it("shows the error when the picture is refused", async () => {
    fakeServer({ "POST /api/worlds/w1/images?kind=token": [{ status: 400, body: { error: "errors.image.invalid" } }] });
    setup(dm, []);
    const file = new File([new Uint8Array([1])], "x.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Immagine del token"), { target: { files: [file] } });
    expect(await screen.findByText("Il file non è un'immagine PNG, JPEG o WebP valida.")).toBeTruthy();
  });
});
