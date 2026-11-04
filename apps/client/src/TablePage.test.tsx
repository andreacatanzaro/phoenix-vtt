// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TableEvent } from "@phoenix/shared";
import { scene, token } from "./table/fixtures";
import { fakeServer } from "./test-helpers";

vi.mock("./Board", () => ({
  Board: (p: { revision: number; tokens: { id: string }[]; selectedId: string | null; showStart: boolean; onSelect: (id: string | null) => void; onMove: (id: string, x: number, y: number) => void }) => (
    <div data-testid="board" data-revision={String(p.revision)} data-selected={p.selectedId ?? ""} data-start={String(p.showStart)} data-tokens={p.tokens.map((t) => t.id).join(",")}>
      <button type="button" onClick={() => { p.onSelect("t1"); }}>board-pick</button>
      <button type="button" onClick={() => { p.onMove("t1", 7, 8); }}>board-move</button>
    </div>
  ),
}));

import { TablePage } from "./TablePage";

class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = 3;
  }
}

const socket = (): FakeSocket => {
  const s = FakeSocket.all.at(-1);
  if (s === undefined) throw new Error("no socket");
  return s;
};
const open = (): void => { act(() => { socket().readyState = 1; socket().onopen?.(); }); };
const receive = (event: TableEvent): void => { act(() => { socket().onmessage?.({ data: JSON.stringify(event) }); }); };

const snapshot = (role: "dm" | "player", over: Partial<Extract<TableEvent, { type: "snapshot" }>> = {}): TableEvent => ({
  type: "snapshot",
  session: { id: "x", title: "La locanda" },
  you: { accountId: role === "dm" ? "dm" : "anna", username: role === "dm" ? "Dora" : "Anna", role },
  scene,
  tokens: [token("t1", { label: "Aldric", ownerAccountId: "anna" })],
  messages: [],
  present: [{ accountId: "anna", username: "Anna" }],
  ...over,
});

const members = { "GET /api/worlds/w1/members": [{ status: 200, body: { members: [{ accountId: "dm", username: "Dora", role: "dm" }, { accountId: "anna", username: "Anna", role: "player" }] } }], "GET /api/worlds/w1/tree": [{ status: 200, body: { regions: [] } }], "GET /api/worlds/w1/scenes/s1/table": [{ status: 200, body: { scene: { mapImageId: null, mapWidth: null, mapHeight: null, gridPx: 70, gridOffsetX: 0, gridOffsetY: 0, start: { x: 2, y: 2, w: 3, h: 2 } } } }] };

beforeEach(() => {
  FakeSocket.all = [];
  vi.stubGlobal("WebSocket", FakeSocket);
  fakeServer(members);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TablePage", () => {
  it("connects to the table of the world and waits for it", () => {
    render(<TablePage worldId="w1" onLeave={vi.fn()} />);
    expect(socket().url).toMatch(/^wss?:\/\/.+\/api\/worlds\/w1\/table$/);
    expect(screen.getByRole("status").textContent).toBe("Mi collego al tavolo…");
  });

  it("shows the session, who is there and the board once the table answers", () => {
    render(<TablePage worldId="w1" onLeave={vi.fn()} />);
    open();
    receive(snapshot("player"));
    expect(screen.getByRole("heading", { name: "La locanda" })).toBeTruthy();
    expect(screen.getByText("Anna (tu)")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Sala comune" })).toBeTruthy();
    expect(screen.getByTestId("board").dataset["tokens"]).toBe("t1");
  });

  it("a player gets no tools of the DM", () => {
    render(<TablePage worldId="w1" onLeave={vi.fn()} />);
    open();
    receive(snapshot("player"));
    expect(screen.queryByRole("region", { name: "Strumenti del DM" })).toBeNull();
    expect(screen.getByRole("region", { name: "Token" })).toBeTruthy();
  });

  it("the DM gets the tools", async () => {
    render(<TablePage worldId="w1" onLeave={vi.fn()} />);
    open();
    receive(snapshot("dm"));
    expect(await screen.findByRole("region", { name: "Strumenti del DM" })).toBeTruthy();
  });

  it("without a scene, tells the player to wait and the DM to choose one", () => {
    const { unmount } = render(<TablePage worldId="w1" onLeave={vi.fn()} />);
    open();
    receive(snapshot("player", { scene: null, tokens: [] }));
    expect(screen.getByText("Il DM non ha ancora aperto una scena.")).toBeTruthy();
    expect(screen.queryByTestId("board")).toBeNull();
    unmount();
    render(<TablePage worldId="w1" onLeave={vi.fn()} />);
    open();
    receive(snapshot("dm", { scene: null, tokens: [] }));
    expect(screen.getByText("Scegli una scena da aprire dagli strumenti del DM.")).toBeTruthy();
  });

  it("sends a move when the board reports one, and selects the token it reports", () => {
    render(<TablePage worldId="w1" onLeave={vi.fn()} />);
    open();
    receive(snapshot("player"));
    fireEvent.click(screen.getByText("board-pick"));
    expect(screen.getByTestId("board").dataset["selected"]).toBe("t1");
    fireEvent.click(screen.getByText("board-move"));
    expect(JSON.parse(socket().sent.at(-1) ?? "null")).toEqual({ type: "token.move", tokenId: "t1", x: 7, y: 8 });
  });

  it("when a move cannot be sent, the board is drawn again from what the server has", () => {
    render(<TablePage worldId="w1" onLeave={vi.fn()} />);
    open();
    receive(snapshot("player"));
    const before = Number(screen.getByTestId("board").dataset["revision"]);
    act(() => { socket().readyState = 3; });
    fireEvent.click(screen.getByText("board-move"));
    expect(socket().sent).toEqual([]);
    expect(Number(screen.getByTestId("board").dataset["revision"])).toBeGreaterThan(before);
  });

  it("a move that was sent does not force a redraw", () => {
    render(<TablePage worldId="w1" onLeave={vi.fn()} />);
    open();
    receive(snapshot("player"));
    const before = screen.getByTestId("board").dataset["revision"];
    fireEvent.click(screen.getByText("board-move"));
    expect(socket().sent).toHaveLength(1);
    expect(screen.getByTestId("board").dataset["revision"]).toBe(before);
  });

  it("lets go of the selection when the token disappears", () => {
    render(<TablePage worldId="w1" onLeave={vi.fn()} />);
    open();
    receive(snapshot("player"));
    fireEvent.click(screen.getByText("board-pick"));
    receive({ type: "token.removed", tokenId: "t1" });
    expect(screen.getByTestId("board").dataset["selected"]).toBe("");
  });

  it("shows a refusal in Italian until it is dismissed", () => {
    render(<TablePage worldId="w1" onLeave={vi.fn()} />);
    open();
    receive(snapshot("player"));
    receive({ type: "error", error: "errors.table.not-your-token" });
    const notice = screen.getByRole("alert");
    expect(notice.textContent).toContain("Puoi muovere solo i tuoi token.");
    fireEvent.click(within(notice).getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("falls back to a generic text for a refusal it does not know", () => {
    render(<TablePage worldId="w1" onLeave={vi.fn()} />);
    open();
    receive(snapshot("player"));
    receive({ type: "error", error: "errors.mai-vista" });
    expect(screen.getByRole("alert").textContent).toContain("Il servizio non è disponibile.");
  });

  it("says when the line drops, and the table comes back by itself", () => {
    vi.useFakeTimers();
    try {
      render(<TablePage worldId="w1" onLeave={vi.fn()} />);
      open();
      receive(snapshot("player"));
      act(() => { socket().onclose?.({ code: 1006 }); });
      expect(screen.getByText("Connessione persa, riprovo…")).toBeTruthy();
      const before = FakeSocket.all.length;
      act(() => { vi.advanceTimersByTime(1000); });
      expect(FakeSocket.all.length).toBe(before + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("when the table is over, says so and lets the person leave", () => {
    const onLeave = vi.fn();
    render(<TablePage worldId="w1" onLeave={onLeave} />);
    open();
    receive(snapshot("player"));
    act(() => { socket().onclose?.({ code: 4000 }); });
    expect(screen.getByText("Il tavolo è chiuso.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Lascia il tavolo" }));
    expect(onLeave).toHaveBeenCalled();
  });

  it("leaving the table closes the connection", () => {
    const { unmount } = render(<TablePage worldId="w1" onLeave={vi.fn()} />);
    open();
    const s = socket();
    unmount();
    expect(s.readyState).toBe(3);
  });

  it("the DM's start-zone switch reaches the board", async () => {
    render(<TablePage worldId="w1" onLeave={vi.fn()} />);
    open();
    receive(snapshot("dm"));
    fireEvent.click(await screen.findByLabelText("Mostra la zona di partenza sulla mappa"));
    expect(screen.getByTestId("board").dataset["start"]).toBe("true");
  });
});
