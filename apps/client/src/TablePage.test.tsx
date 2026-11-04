// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useImperativeHandle, type Ref } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TableEvent } from "@phoenix/shared";
import type { BoardHandle } from "./Board";
import type { BoardMove } from "./table/board-view";
import type { Point } from "./table/geometry";
import { scene, token } from "./table/fixtures";
import { fakeServer } from "./test-helpers";

type BoardProps = {
  tool: string;
  selectMode: string;
  measureMode: string;
  selectedIds: ReadonlySet<string>;
  showStart: boolean;
  revision: number;
  resetViewSeq: number;
  align: { step: string; state: { anchor: { x: number; y: number }; size: number }; preview: boolean } | null;
  onAlign: (state: { anchor: { x: number; y: number }; size: number }) => void;
  viewRequest: { seq: number } | null;
  tokens: { id: string }[];
  scene: { id: string };
  onSelect: (ids: string[]) => void;
  onMove: (moves: BoardMove[]) => void;
  onPointer: (x: number | null, y: number | null) => void;
  onPlaceText: (cell: Point, at: Point) => void;
  onView: (view: { x: number; y: number; zoom: number }) => void;
  onAnchor: (at: Point | null) => void;
  ref?: Ref<BoardHandle>;
};

let board: BoardProps | null = null;
let boardRenders = 0;
const setView = vi.fn();
const getView = vi.fn(() => ({ x: 700, y: 420, zoom: 1.5 }));

vi.mock("./Board", () => ({
  Board: (p: BoardProps) => {
    board = p;
    boardRenders += 1;
    useImperativeHandle(p.ref, () => ({ getView, setView, nudge: vi.fn(), zoomBy: vi.fn() }));
    return <div data-testid="board" data-tool={p.tool} data-select-mode={p.selectMode} data-measure-mode={p.measureMode} data-show-start={String(p.showStart)} data-revision={String(p.revision)} data-reset={String(p.resetViewSeq)} data-align={p.align === null ? "" : `${p.align.step}:${String(p.align.state.size)}:${String(p.align.preview)}`} data-request={String(p.viewRequest?.seq ?? 0)} data-selected={[...p.selectedIds].join(",")} data-tokens={p.tokens.map((t) => t.id).join(",")} />;
  },
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
const parse = (text: string): unknown => {
  const value: unknown = JSON.parse(text);
  return value;
};
const sent = (): unknown[] => socket().sent.map(parse);
const lastSent = (): unknown => sent().at(-1);
const theBoard = (): BoardProps => {
  if (board === null) throw new Error("no board");
  return board;
};

const snapshot = (role: "dm" | "player", over: Partial<Extract<TableEvent, { type: "snapshot" }>> = {}): TableEvent => ({
  type: "snapshot",
  session: { id: "x", title: "La locanda" },
  you: { accountId: role === "dm" ? "dm" : "anna", username: role === "dm" ? "Dora" : "Anna", role },
  scene,
  tokens: [token("t1", { label: "Aldric", ownerAccountId: "anna" }), token("t2", { label: "Goblin" })],
  messages: [],
  present: [{ accountId: "anna", username: "Anna" }],
  ...over,
});

const world = {
  "GET /api/worlds/w1/members": [{ status: 200, body: { members: [{ accountId: "dm", username: "Dora", role: "dm" }, { accountId: "anna", username: "Anna", role: "player" }] } }],
  "GET /api/worlds/w1/tree": [{ status: 200, body: { regions: [] } }],
  "GET /api/worlds/w1/scenes/s1/table": [{ status: 200, body: { scene: { mapImageId: null, mapWidth: null, mapHeight: null, gridPx: 70, gridOffsetX: 0, gridOffsetY: 0, start: { x: 2, y: 2, w: 3, h: 2 } } } }],
};

beforeEach(() => {
  FakeSocket.all = [];
  board = null;
  boardRenders = 0;
  setView.mockClear();
  getView.mockClear();
  vi.stubGlobal("WebSocket", FakeSocket);
  fakeServer(world);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function sit(role: "dm" | "player", over: Partial<Extract<TableEvent, { type: "snapshot" }>> = {}) {
  const onLeave = vi.fn();
  render(<TablePage worldId="w1" onLeave={onLeave} />);
  open();
  receive(snapshot(role, over));
  return { onLeave };
}

const press = (key: string, target: Element | Window = window): void => { act(() => { fireEvent.keyDown(target, { key }); }); };
const tool = (): string | undefined => screen.getByTestId("board").dataset["tool"];

describe("the screen", () => {
  it("connects to the table of the world and waits for it", () => {
    render(<TablePage worldId="w1" onLeave={vi.fn()} />);
    expect(socket().url).toMatch(/^wss?:\/\/.+\/api\/worlds\/w1\/table$/);
    expect(screen.getByRole("status").textContent).toBe("Mi collego al tavolo…");
  });

  it("fills the screen with the board, with the menu, the tools, the scale and the help floating over it", () => {
    sit("player");
    expect(screen.getByTestId("board")).toBeTruthy();
    expect(screen.getByRole("toolbar", { name: "Menu del tavolo" })).toBeTruthy();
    expect(screen.getByRole("toolbar", { name: "Strumenti" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Controlli della scena" }).textContent).toBe("1,5 m");
    expect(screen.getByRole("button", { name: "Scorciatoie e aiuto" })).toBeTruthy();
    expect(screen.getByText("La locanda")).toBeTruthy();
  });

  it("leaves the table with the exit button", () => {
    const { onLeave } = sit("player");
    fireEvent.click(screen.getByRole("button", { name: "Lascia il tavolo" }));
    expect(onLeave).toHaveBeenCalled();
  });

  it("without a scene tells the player to wait and the DM where to choose one", () => {
    sit("player", { scene: null, tokens: [] });
    expect(screen.getByText("Il DM non ha ancora aperto una scena.")).toBeTruthy();
    expect(screen.queryByTestId("board")).toBeNull();
    cleanup();
    FakeSocket.all = [];
    sit("dm", { scene: null, tokens: [] });
    expect(screen.getByText("Scegli una scena da aprire con il pulsante Scene, in basso.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Scene" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Token" })).toBeNull();
  });

  it("shows a refusal in Italian until it is dismissed, and a generic text for one it does not know", () => {
    sit("player");
    receive({ type: "error", error: "errors.table.not-your-token" });
    const notice = screen.getByRole("alert");
    expect(notice.textContent).toContain("Puoi muovere solo i tuoi token.");
    fireEvent.click(within(notice).getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("alert")).toBeNull();
    receive({ type: "error", error: "errors.mai-vista" });
    expect(screen.getByRole("alert").textContent).toContain("Il servizio non è disponibile.");
  });

  it("says when the line drops, and the table comes back by itself", () => {
    vi.useFakeTimers();
    try {
      sit("player");
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
    const { onLeave } = sit("player");
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
});

describe("the tools", () => {
  it("a player has Move, Select, Measure and Pointer; the DM also has Text", () => {
    sit("player");
    expect(within(screen.getByRole("toolbar", { name: "Strumenti" })).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Sposta", "Seleziona", "Misura", "Puntatore"]);
    cleanup();
    FakeSocket.all = [];
    sit("dm");
    expect(within(screen.getByRole("toolbar", { name: "Strumenti" })).getAllByRole("button")).toHaveLength(5);
  });

  it("starts with Move, as Owlbear Rodeo does, and a click picks another", () => {
    sit("player");
    expect(tool()).toBe("move");
    fireEvent.click(screen.getByRole("button", { name: "Seleziona" }));
    expect(tool()).toBe("select");
  });

  it("the keys W, S, M, Q and T pick the tools, T only for the DM", () => {
    sit("dm");
    for (const [key, name] of [["s", "select"], ["m", "measure"], ["q", "pointer"], ["t", "text"], ["w", "move"]] as const) {
      press(key);
      expect(tool()).toBe(name);
    }
    cleanup();
    FakeSocket.all = [];
    sit("player");
    press("s");
    press("t");
    expect(tool()).toBe("select");
  });

  it("keys typed in a field are not for the tools", () => {
    sit("player");
    fireEvent.click(screen.getByRole("button", { name: "Chat e dadi" }));
    const box = screen.getByLabelText("Messaggio");
    press("s", box);
    expect(tool()).toBe("move");
  });

  it("keys with Ctrl, Cmd or Alt are left to the browser", () => {
    sit("player");
    act(() => { fireEvent.keyDown(window, { key: "s", metaKey: true }); });
    act(() => { fireEvent.keyDown(window, { key: "s", ctrlKey: true }); });
    expect(tool()).toBe("move");
  });

  it("the options of the tool appear with it and reach the board", () => {
    sit("player");
    expect(screen.queryByRole("toolbar", { name: "Opzioni dello strumento" })).toBeNull();
    press("s");
    fireEvent.click(screen.getByRole("button", { name: "Selezione a mano libera" }));
    expect(screen.getByTestId("board").dataset["selectMode"]).toBe("lasso");
    press("m");
    fireEvent.click(screen.getByRole("button", { name: "Raggio" }));
    expect(screen.getByTestId("board").dataset["measureMode"]).toBe("radius");
  });

  it("the column of tools can be folded away", () => {
    sit("player");
    fireEvent.click(screen.getByRole("button", { name: "Mostra o nascondi gli strumenti" }));
    expect(screen.queryByRole("toolbar", { name: "Strumenti" })).toBeNull();
  });

  it("the pointer is sent as it moves, and put away with null", () => {
    sit("player");
    act(() => { theBoard().onPointer(120, 80); });
    expect(lastSent()).toEqual({ type: "pointer", x: 120, y: 80 });
    act(() => { theBoard().onPointer(null, null); });
    expect(lastSent()).toEqual({ type: "pointer", x: null, y: null });
  });

  it("someone else's pointer reaches the board", () => {
    sit("player");
    receive({ type: "pointer", accountId: "bruno", username: "Bruno", x: 5, y: 6 });
    expect(screen.getByTestId("board")).toBeTruthy();
  });
});

describe("the panels", () => {
  it("the players panel lists who is in the world and who is at the table", async () => {
    sit("player");
    fireEvent.click(screen.getByRole("button", { name: "Giocatori" }));
    const panel = screen.getByRole("region", { name: "Giocatori" });
    expect(within(panel).getByText("Anna (tu)")).toBeTruthy();
    // The members come from the server after the table is open.
    expect(await within(panel).findByText("Dora")).toBeTruthy();
  });

  it("the chat panel opens and closes, and only one panel is open at a time", () => {
    sit("player");
    fireEvent.click(screen.getByRole("button", { name: "Chat e dadi" }));
    expect(screen.getByRole("region", { name: "Chat e dadi" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Giocatori" }));
    expect(screen.queryByRole("region", { name: "Chat e dadi" })).toBeNull();
    expect(screen.getByRole("region", { name: "Giocatori" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Giocatori" }));
    expect(screen.queryByRole("region", { name: "Giocatori" })).toBeNull();
  });

  it("Escape closes the panels, then lets go of the selection", () => {
    sit("player");
    press("s");
    act(() => { theBoard().onSelect(["t1"]); });
    fireEvent.click(screen.getByRole("button", { name: "Chat e dadi" }));
    press("Escape");
    expect(screen.queryByRole("region", { name: "Chat e dadi" })).toBeNull();
    expect(screen.getByTestId("board").dataset["selected"]).toBe("t1");
    press("Escape");
    expect(screen.getByTestId("board").dataset["selected"]).toBe("");
  });

  it("a player has the list of tokens in the menu, to pick one without the mouse", () => {
    sit("player");
    fireEvent.click(screen.getByRole("button", { name: "Token" }));
    const list = screen.getByRole("list", { name: "Token in scena" });
    fireEvent.click(within(list).getByRole("button", { name: "Seleziona Aldric" }));
    expect(screen.getByTestId("board").dataset["selected"]).toBe("t1");
    expect(screen.queryByRole("button", { name: "Aggiungi token" })).toBeNull();
  });

  it("picking a token from the list opens its details, whatever the tool, so it can be moved without the mouse", () => {
    sit("player");
    expect(tool()).toBe("move");
    fireEvent.click(screen.getByRole("button", { name: "Token" }));
    fireEvent.click(within(screen.getByRole("list", { name: "Token in scena" })).getByRole("button", { name: "Seleziona Aldric" }));
    const details = screen.getByRole("region", { name: "Dettagli" });
    expect(within(details).getByText("Quadretto 0, 0")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Token in scena" })).toBeNull();
  });

  it("the DM's list does the same", () => {
    sit("dm");
    fireEvent.click(screen.getByRole("button", { name: "Token" }));
    fireEvent.click(within(screen.getByRole("list", { name: "Token in scena" })).getByRole("button", { name: "Seleziona Goblin" }));
    expect(screen.getByTestId("board").dataset["selected"]).toBe("t2");
    expect(screen.getByRole("region", { name: "Dettagli" })).toBeTruthy();
  });

  it("the DM has the bar of scenes and tokens at the bottom, with the form to add tokens", () => {
    sit("dm");
    expect(screen.getByRole("toolbar", { name: "Aggiungi al tavolo" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Token" }));
    expect(screen.getByRole("button", { name: "Aggiungi token" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Scene" }));
    expect(screen.queryByRole("button", { name: "Aggiungi token" })).toBeNull();
    expect(screen.getByRole("region", { name: "Scene" })).toBeTruthy();
  });

  it("the help lists the keys of the tools the person has, and closes with a second click", () => {
    sit("player");
    fireEvent.click(screen.getByRole("button", { name: "Scorciatoie e aiuto" }));
    const help = screen.getByRole("region", { name: "Come si usa la mappa" });
    expect(within(help).getByText("S")).toBeTruthy();
    expect(within(help).queryByText("T")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Scorciatoie e aiuto" }));
    expect(screen.queryByRole("region", { name: "Come si usa la mappa" })).toBeNull();
  });
});

describe("selecting and moving", () => {
  it("the bar of the selection appears under the selection, with the Select tool, and goes with the tool", () => {
    sit("dm");
    press("s");
    act(() => { theBoard().onSelect(["t2"]); theBoard().onAnchor({ x: 200, y: 300 }); });
    expect(screen.getByRole("toolbar", { name: "Azioni sulla selezione" }).getAttribute("style")).toContain("left: 200px");
    press("m");
    expect(screen.queryByRole("toolbar", { name: "Azioni sulla selezione" })).toBeNull();
  });

  it("the DM hides, duplicates and removes what is selected", () => {
    sit("dm");
    press("s");
    act(() => { theBoard().onSelect(["t2"]); theBoard().onAnchor({ x: 10, y: 10 }); });
    fireEvent.click(screen.getByRole("button", { name: "Nascondi ai giocatori" }));
    expect(lastSent()).toEqual({ type: "token.update", tokenId: "t2", hidden: true });
    fireEvent.click(screen.getByRole("button", { name: "Duplica" }));
    expect(lastSent()).toMatchObject({ type: "token.add", label: "Goblin", x: 1, y: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Elimina" }));
    expect(lastSent()).toEqual({ type: "token.remove", tokenId: "t2" });
  });

  it("'more' opens the details of the token, and removing it from there closes them and the selection", () => {
    sit("dm");
    press("s");
    act(() => { theBoard().onSelect(["t2"]); theBoard().onAnchor({ x: 10, y: 10 }); });
    fireEvent.click(screen.getByRole("button", { name: "Altro" }));
    const details = screen.getByRole("region", { name: "Dettagli" });
    expect(within(details).getByText("Quadretto 0, 0")).toBeTruthy();
    fireEvent.click(within(details).getByRole("button", { name: "Rimuovi dal tavolo" }));
    expect(lastSent()).toEqual({ type: "token.remove", tokenId: "t2" });
    expect(screen.queryByRole("region", { name: "Dettagli" })).toBeNull();
    expect(screen.getByTestId("board").dataset["selected"]).toBe("");
  });

  it("a player gets only 'more' for their token", () => {
    sit("player");
    press("s");
    act(() => { theBoard().onSelect(["t1"]); theBoard().onAnchor({ x: 10, y: 10 }); });
    expect(screen.getByRole("button", { name: "Altro" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Elimina" })).toBeNull();
  });

  it("a token that goes away leaves the selection", () => {
    sit("dm");
    press("s");
    act(() => { theBoard().onSelect(["t2"]); theBoard().onAnchor({ x: 10, y: 10 }); });
    receive({ type: "token.removed", tokenId: "t2" });
    expect(screen.getByTestId("board").dataset["selected"]).toBe("");
    expect(screen.queryByRole("toolbar", { name: "Azioni sulla selezione" })).toBeNull();
  });

  it("sends one move for each token the board reports, and nothing is redrawn when all were sent", () => {
    sit("dm");
    const before = screen.getByTestId("board").dataset["revision"];
    act(() => { theBoard().onMove([{ id: "t1", x: 3, y: 4 }, { id: "t2", x: 5, y: 6 }]); });
    expect(sent().slice(-2)).toEqual([{ type: "token.move", tokenId: "t1", x: 3, y: 4 }, { type: "token.move", tokenId: "t2", x: 5, y: 6 }]);
    expect(screen.getByTestId("board").dataset["revision"]).toBe(before);
  });

  it("when a move cannot be sent, the board is drawn again from what the server has", () => {
    sit("dm");
    const before = Number(screen.getByTestId("board").dataset["revision"]);
    act(() => { socket().readyState = 3; });
    act(() => { theBoard().onMove([{ id: "t1", x: 3, y: 4 }]); });
    expect(Number(screen.getByTestId("board").dataset["revision"])).toBeGreaterThan(before);
  });
});

describe("writing a text", () => {
  it("asks for the words where the tool was used, and writes them on that square", () => {
    sit("dm");
    press("t");
    act(() => { theBoard().onPlaceText({ x: 4, y: 5 }, { x: 300, y: 200 }); });
    const input = screen.getByLabelText("Testo da scrivere sulla mappa");
    fireEvent.change(input, { target: { value: "  La botola  " } });
    fireEvent.submit(input.closest("form") ?? input);
    expect(lastSent()).toEqual({ type: "token.add", kind: "text", label: "La botola", color: "gold", x: 4, y: 5, size: 1, hidden: false, travels: false, ownerAccountId: null, imageId: null });
    expect(screen.queryByLabelText("Testo da scrivere sulla mappa")).toBeNull();
  });

  it("writes nothing for an empty text, and Escape drops it", () => {
    sit("dm");
    act(() => { theBoard().onPlaceText({ x: 1, y: 1 }, { x: 10, y: 10 }); });
    const before = sent().length;
    fireEvent.submit(screen.getByLabelText("Testo da scrivere sulla mappa").closest("form") ?? document.body);
    expect(sent().length).toBe(before);
    act(() => { theBoard().onPlaceText({ x: 1, y: 1 }, { x: 10, y: 10 }); });
    press("Escape");
    expect(screen.queryByLabelText("Testo da scrivere sulla mappa")).toBeNull();
  });

  it("Escape drops it even while the cursor is in its own field", () => {
    sit("dm");
    act(() => { theBoard().onPlaceText({ x: 1, y: 1 }, { x: 10, y: 10 }); });
    const input = screen.getByLabelText("Testo da scrivere sulla mappa");
    input.focus();
    press("Escape", input);
    expect(screen.queryByLabelText("Testo da scrivere sulla mappa")).toBeNull();
  });

  it("the cancel button drops it too", () => {
    sit("dm");
    act(() => { theBoard().onPlaceText({ x: 1, y: 1 }, { x: 10, y: 10 }); });
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(screen.queryByLabelText("Testo da scrivere sulla mappa")).toBeNull();
  });

  it("a text still being written is dropped when the scene changes", () => {
    sit("dm");
    act(() => { theBoard().onPlaceText({ x: 1, y: 1 }, { x: 10, y: 10 }); });
    receive(snapshot("dm", { scene: { ...scene, id: "s2", name: "Cantina" }, tokens: [] }));
    expect(screen.queryByLabelText("Testo da scrivere sulla mappa")).toBeNull();
  });
});

describe("the place of the selection bar", () => {
  it("does not draw the board again when the board says the same place twice", () => {
    sit("dm");
    act(() => { theBoard().onSelect(["t2"]); theBoard().onAnchor({ x: 10, y: 10 }); });
    const before = boardRenders;
    act(() => { theBoard().onAnchor({ x: 10, y: 10 }); });
    expect(boardRenders).toBe(before);
    act(() => { theBoard().onAnchor({ x: 10, y: 11 }); });
    expect(boardRenders).toBeGreaterThan(before);
  });
});

describe("aligning the map", () => {
  const withMap = { ...scene, mapImageId: "img1", mapWidth: 1400, mapHeight: 900 };
  const startAligning = async (): Promise<void> => {
    fireEvent.click(screen.getByRole("button", { name: "Controlli della scena" }));
    fireEvent.click(await screen.findByRole("button", { name: "Allinea la mappa alla griglia" }));
  };
  const align = (): string | undefined => screen.getByTestId("board").dataset["align"];

  it("starts from the controls: the controls close, the bar opens and the board gets the anchor in the middle of the map", async () => {
    sit("dm", { scene: withMap });
    expect(align()).toBe("");
    await startAligning();
    expect(screen.queryByRole("region", { name: "Controlli della scena" })).toBeNull();
    expect(screen.getByRole("toolbar", { name: "Passi dell'allineamento" })).toBeTruthy();
    expect(align()).toBe("offset:70:false");
    expect(theBoard().align?.state.anchor).toEqual({ x: 700, y: 450 });
  });

  it("follows what is dragged on the board, the steps and the preview", async () => {
    sit("dm", { scene: withMap });
    await startAligning();
    act(() => { theBoard().onAlign({ anchor: { x: 10, y: 20 }, size: 90 }); });
    expect(align()).toBe("offset:90:false");
    fireEvent.click(screen.getByRole("button", { name: "2. Dimensione" }));
    expect(align()).toBe("size:90:false");
    fireEvent.click(screen.getByRole("checkbox", { name: "Anteprima della griglia" }));
    expect(align()).toBe("size:90:true");
  });

  it("Escape gives it up before it closes anything else", async () => {
    sit("dm", { scene: withMap });
    await startAligning();
    press("Escape");
    expect(align()).toBe("");
    expect(screen.queryByRole("toolbar", { name: "Passi dell'allineamento" })).toBeNull();
  });

  it("applying saves the grid and closes the bar", async () => {
    const server = fakeServer({ ...world, "PATCH /api/worlds/w1/scenes/s1/table": [{ status: 200, body: { scene: { mapImageId: null, mapWidth: null, mapHeight: null, gridPx: 90, gridOffsetX: 5, gridOffsetY: 72, start: { x: 2, y: 2, w: 3, h: 2 } } } }] });
    sit("dm", { scene: withMap });
    await startAligning();
    act(() => { theBoard().onAlign({ anchor: { x: 905, y: 612 }, size: 90 }); });
    fireEvent.click(screen.getByRole("button", { name: "Applica" }));
    await waitFor(() => { expect(align()).toBe(""); });
    expect(server.bodies["PATCH /api/worlds/w1/scenes/s1/table"]).toEqual([{ gridPx: 90, gridOffsetX: 5, gridOffsetY: 72 }]);
  });

  it("is dropped when the scene changes", async () => {
    sit("dm", { scene: withMap });
    await startAligning();
    receive(snapshot("dm", { scene: { ...withMap, id: "s2", name: "Cantina" }, tokens: [] }));
    expect(align()).toBe("");
  });

  it("has no button for a scene without a map", async () => {
    sit("dm");
    fireEvent.click(screen.getByRole("button", { name: "Controlli della scena" }));
    await screen.findByRole("button", { name: "Salva mappa e griglia" });
    expect(screen.queryByRole("button", { name: "Allinea la mappa alla griglia" })).toBeNull();
  });
});

describe("the scale and the view", () => {
  it("the scale button opens the controls of the scene, and closes them again", () => {
    sit("player");
    fireEvent.click(screen.getByRole("button", { name: "Controlli della scena" }));
    expect(screen.getByRole("region", { name: "Controlli della scena" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Controlli della scena" }));
    expect(screen.queryByRole("region", { name: "Controlli della scena" })).toBeNull();
  });

  it("shows where the view is once the board says so, and moves the board when a number is typed", () => {
    sit("player");
    act(() => { theBoard().onView({ x: 700, y: 420, zoom: 1.5 }); });
    fireEvent.click(screen.getByRole("button", { name: "Controlli della scena" }));
    const x = screen.getByLabelText("Posizione X");
    expect(x).toHaveProperty("value", "700");
    fireEvent.change(x, { target: { value: "900" } });
    expect(setView).toHaveBeenCalledWith({ x: 900, y: 420 }, 1.5);
  });

  it("goes back to the whole board", () => {
    sit("player");
    act(() => { theBoard().onView({ x: 1, y: 1, zoom: 1 }); });
    fireEvent.click(screen.getByRole("button", { name: "Controlli della scena" }));
    fireEvent.click(screen.getByRole("button", { name: "Ripristina la vista" }));
    expect(screen.getByTestId("board").dataset["reset"]).toBe("1");
  });

  it("the DM takes everyone to the view he or she is looking at", () => {
    sit("dm");
    act(() => { theBoard().onView({ x: 1, y: 1, zoom: 1 }); });
    fireEvent.click(screen.getByRole("button", { name: "Controlli della scena" }));
    fireEvent.click(screen.getByRole("button", { name: "Porta tutti alla mia vista" }));
    expect(lastSent()).toEqual({ type: "view.sync", x: 700, y: 420, zoom: 1.5 });
  });

  it("when the DM brings everyone to a view, the board is asked to go there, each time", () => {
    sit("player");
    expect(screen.getByTestId("board").dataset["request"]).toBe("0");
    receive({ type: "view.sync", x: 700, y: 450, zoom: 1.5 });
    expect(screen.getByTestId("board").dataset["request"]).toBe("1");
    receive({ type: "view.sync", x: 700, y: 450, zoom: 1.5 });
    expect(screen.getByTestId("board").dataset["request"]).toBe("2");
  });

  it("the DM's start zone switch reaches the board", async () => {
    sit("dm");
    fireEvent.click(screen.getByRole("button", { name: "Controlli della scena" }));
    fireEvent.click(await screen.findByLabelText("Mostra la zona di partenza sulla mappa"));
    expect(screen.getByTestId("board").dataset["showStart"]).toBe("true");
  });
});
