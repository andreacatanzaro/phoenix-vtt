// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SelectionBar } from "./SelectionBar";
import { token } from "./table/fixtures";

afterEach(cleanup);

function setup(selected: ReturnType<typeof token>[], isDm: boolean) {
  const send = vi.fn(() => true);
  const onMore = vi.fn();
  render(<SelectionBar selected={selected} isDm={isDm} at={{ x: 120, y: 340 }} send={send} onMore={onMore} />);
  return { send, onMore };
}

describe("SelectionBar", () => {
  it("shows nothing when nothing is selected", () => {
    const { container } = render(<SelectionBar selected={[]} isDm at={{ x: 0, y: 0 }} send={vi.fn()} onMore={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("sits where it is told, under the selection", () => {
    setup([token("a")], true);
    const bar = screen.getByRole("toolbar", { name: "Azioni sulla selezione" });
    expect(bar.getAttribute("style")).toContain("left: 120px");
    expect(bar.getAttribute("style")).toContain("top: 340px");
  });

  it("the DM hides a token from the players, and shows it again", () => {
    const { send } = setup([token("a")], true);
    fireEvent.click(screen.getByRole("button", { name: "Nascondi ai giocatori" }));
    expect(send).toHaveBeenCalledWith({ type: "token.update", tokenId: "a", hidden: true });
    cleanup();
    const again = setup([token("a", { hidden: true })], true);
    fireEvent.click(screen.getByRole("button", { name: "Mostra ai giocatori" }));
    expect(again.send).toHaveBeenCalledWith({ type: "token.update", tokenId: "a", hidden: false });
  });

  it("with several selected, it hides all of them, or shows all if every one is hidden", () => {
    const { send } = setup([token("a"), token("b", { hidden: true })], true);
    fireEvent.click(screen.getByRole("button", { name: "Nascondi ai giocatori" }));
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(1, { type: "token.update", tokenId: "a", hidden: true });
    expect(send).toHaveBeenNthCalledWith(2, { type: "token.update", tokenId: "b", hidden: true });
  });

  it("duplicates a token one square over, as a new token with no owner", () => {
    const { send } = setup([token("a", { label: "Orco", color: "green", x: 3, y: 4, size: 2, ownerAccountId: "anna", travels: true, hidden: true })], true);
    fireEvent.click(screen.getByRole("button", { name: "Duplica" }));
    expect(send).toHaveBeenCalledWith({ type: "token.add", kind: "token", label: "Orco", color: "green", x: 4, y: 5, size: 2, hidden: true, travels: true, ownerAccountId: null, imageId: null });
  });

  it("duplicates a token on the edge of the board one square the other way, so the copy is always valid", () => {
    const { send } = setup([token("a", { x: 1000, y: 1000 })], true);
    fireEvent.click(screen.getByRole("button", { name: "Duplica" }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: "token.add", x: 999, y: 999 }));
  });

  it("duplicates a text as a text", () => {
    const { send } = setup([token("n", { kind: "text", label: "Nota", x: 1, y: 1 })], true);
    fireEvent.click(screen.getByRole("button", { name: "Duplica" }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: "token.add", kind: "text", label: "Nota", x: 2, y: 2 }));
  });

  it("removes every selected token", () => {
    const { send } = setup([token("a"), token("b")], true);
    fireEvent.click(screen.getByRole("button", { name: "Elimina" }));
    expect(send).toHaveBeenNthCalledWith(1, { type: "token.remove", tokenId: "a" });
    expect(send).toHaveBeenNthCalledWith(2, { type: "token.remove", tokenId: "b" });
  });

  it("'more' is there for one token, with the details; for several there is the count instead", () => {
    const one = setup([token("a")], true);
    fireEvent.click(screen.getByRole("button", { name: "Altro" }));
    expect(one.onMore).toHaveBeenCalled();
    cleanup();
    setup([token("a"), token("b"), token("c")], true);
    expect(screen.queryByRole("button", { name: "Altro" })).toBeNull();
    expect(screen.getByText("3 elementi selezionati")).toBeTruthy();
  });

  it("a player has only 'more', and none of the DM's actions", () => {
    setup([token("a", { ownerAccountId: "anna" })], false);
    expect(screen.getByRole("button", { name: "Altro" })).toBeTruthy();
    for (const name of ["Nascondi ai giocatori", "Duplica", "Elimina"]) expect(screen.queryByRole("button", { name })).toBeNull();
  });
});
