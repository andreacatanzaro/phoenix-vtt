// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "./ChatPanel";
import { message, people, player } from "./table/fixtures";
import { inputLabelled } from "./test-helpers";

afterEach(cleanup);

function setup(messages = [message("m1", { text: "Ciao a tutti" })], send = vi.fn(() => true)) {
  render(<ChatPanel messages={messages} me={player} people={people} send={send} />);
  return send;
}

describe("ChatPanel", () => {
  it("says so when there is nothing to read", () => {
    setup([]);
    expect(screen.getByText("Ancora niente da leggere.")).toBeTruthy();
  });

  it("shows each kind of line in its own way", () => {
    setup([
      message("1", { text: "Ciao a tutti" }),
      message("2", { kind: "system", authorId: null, authorName: "", text: "Il DM apre la scena «Sala»." }),
      message("3", { kind: "roll", authorName: "Bruno", notation: "2d6+3", roll: { dice: [4, 5], kept: [4, 5], modifier: 3, total: 12 } }),
      message("4", { audience: "gm", kind: "roll", authorName: "Bruno", notation: "1d20", roll: { dice: [17], kept: [17], modifier: 0, total: 17 } }),
    ]);
    const log = screen.getByRole("log", { name: "Registro del tavolo" });
    expect(within(log).getByText("Ciao a tutti")).toBeTruthy();
    expect(within(log).getByText("Il DM apre la scena «Sala».")).toBeTruthy();
    expect(within(log).getByText("Bruno tira 2d6+3")).toBeTruthy();
    expect(within(log).getByLabelText("12")).toBeTruthy();
    expect(within(log).getByText("[4, 5]")).toBeTruthy();
    expect(within(log).getByText("Riservato al DM")).toBeTruthy();
  });

  it("labels a whisper by who it is from or to", () => {
    setup([
      message("1", { audience: "whisper", authorId: "bruno", authorName: "Bruno", recipientId: "anna", recipientName: "Anna", text: "Psst" }),
      message("2", { audience: "whisper", authorId: "anna", authorName: "Anna", recipientId: "bruno", recipientName: "Bruno", text: "Zitto" }),
    ]);
    const log = within(screen.getByRole("log", { name: "Registro del tavolo" }));
    expect(log.getByText("Sussurro da Bruno")).toBeTruthy();
    expect(log.getByText("Sussurro a Bruno")).toBeTruthy();
  });

  it("sends what is written, to everyone, and empties the box", () => {
    const send = setup();
    const box = inputLabelled("Messaggio");
    fireEvent.change(box, { target: { value: "  Entro nella locanda  " } });
    fireEvent.click(screen.getByRole("button", { name: "Invia" }));
    expect(send).toHaveBeenCalledWith({ type: "chat.send", text: "Entro nella locanda", whisperTo: null });
    expect(box.value).toBe("");
  });

  it("keeps the text when the line is down, so nothing is lost", () => {
    const send = setup([], vi.fn(() => false));
    const box = inputLabelled("Messaggio");
    fireEvent.change(box, { target: { value: "Ci sei?" } });
    fireEvent.click(screen.getByRole("button", { name: "Invia" }));
    expect(send).toHaveBeenCalled();
    expect(box.value).toBe("Ci sei?");
  });

  it("sends nothing for an empty message", () => {
    const send = setup();
    fireEvent.change(screen.getByLabelText("Messaggio"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Invia" }));
    expect(send).not.toHaveBeenCalled();
  });

  it("whispers to someone else, and never offers oneself", () => {
    const send = setup();
    const to = screen.getByLabelText("Destinatario");
    const names = within(to).getAllByRole("option").map((o) => o.textContent);
    expect(names).toEqual(["Tutti", "Sussurro a Dora", "Sussurro a Bruno"]);
    fireEvent.change(to, { target: { value: "bruno" } });
    fireEvent.change(screen.getByLabelText("Messaggio"), { target: { value: "Psst" } });
    fireEvent.click(screen.getByRole("button", { name: "Invia" }));
    expect(send).toHaveBeenCalledWith({ type: "chat.send", text: "Psst", whisperTo: "bruno" });
  });

  it("rolls a die with one click, reserved or not", () => {
    const send = setup();
    fireEvent.click(screen.getByRole("button", { name: "d20" }));
    expect(send).toHaveBeenLastCalledWith({ type: "roll.request", notation: "1d20", reserved: false });
    fireEvent.click(screen.getByLabelText("Tiro riservato al DM"));
    fireEvent.click(screen.getByRole("button", { name: "d6" }));
    expect(send).toHaveBeenLastCalledWith({ type: "roll.request", notation: "1d6", reserved: true });
  });

  it("rolls a written notation, and ignores an empty one", () => {
    const send = setup();
    fireEvent.click(screen.getByRole("button", { name: "Tira" }));
    expect(send).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Notazione"), { target: { value: " 4d6kh3 " } });
    fireEvent.click(screen.getByRole("button", { name: "Tira" }));
    expect(send).toHaveBeenCalledWith({ type: "roll.request", notation: "4d6kh3", reserved: false });
  });
});
