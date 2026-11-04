// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardCallbacks, BoardProps } from "./table/board-view";
import { scene, token } from "./table/fixtures";

type Made = { updates: BoardProps[]; destroyed: number; callbacks: BoardCallbacks; setViews: { center: { x: number; y: number }; zoom: number }[]; nudges: [number, number][]; zooms: number[] };
const made: Made[] = [];
let finishMaking: (() => void) | null = null;
let hold = false;

vi.mock("./table/board-view", () => ({
  BoardView: {
    create: (_host: HTMLElement, callbacks: BoardCallbacks) => {
      const board: Made & { update: (p: BoardProps) => void; destroy: () => void; getView: () => { x: number; y: number; zoom: number }; setView: (c: { x: number; y: number }, z: number) => void; nudge: (dx: number, dy: number) => void; zoomBy: (f: number) => void } = {
        updates: [],
        destroyed: 0,
        setViews: [],
        nudges: [],
        zooms: [],
        callbacks,
        update(p) { this.updates.push(p); },
        destroy() { this.destroyed += 1; },
        getView: () => ({ x: 10, y: 20, zoom: 1.5 }),
        setView(center, zoom) { this.setViews.push({ center, zoom }); },
        nudge(dx: number, dy: number) { this.nudges.push([dx, dy]); },
        zoomBy(f: number) { this.zooms.push(f); },
      };
      made.push(board);
      return new Promise((resolve) => {
        if (hold) finishMaking = () => { resolve(board); };
        else resolve(board);
      });
    },
  },
}));

import { Board, KEY_PAN_PX, KEY_ZOOM, type BoardHandle } from "./Board";

beforeEach(() => {
  made.length = 0;
  finishMaking = null;
  hold = false;
});
afterEach(cleanup);

const callbacks = () => ({ onSelect: vi.fn(), onMove: vi.fn(), onPointer: vi.fn(), onPlaceText: vi.fn(), onView: vi.fn(), onAnchor: vi.fn(), onAlign: vi.fn(), onStartZone: vi.fn() });
const baseProps = () => ({
  worldId: "w1",
  scene,
  tokens: [token("a")],
  me: { accountId: "anna", role: "player" as const },
  selectedIds: new Set<string>(),
  tool: "move" as const,
  selectMode: "rectangle" as const,
  measureMode: "ruler" as const,
  showStart: false,
  revision: 1,
  pointers: new Map(),
  viewRequest: null,
  resetViewSeq: 0,
  align: null,
  ...callbacks(),
});

function first(): Made {
  const board = made[0];
  if (board === undefined) throw new Error("no board was made");
  return board;
}

describe("Board", () => {
  it("is a labelled region the canvas goes into", () => {
    render(<Board {...baseProps()} />);
    expect(screen.getByRole("application", { name: "Mappa della scena" })).toBeTruthy();
  });

  it("draws what it is given, with the address of the pictures of this world", async () => {
    render(<Board {...baseProps()} />);
    await waitFor(() => { expect(first().updates).toHaveLength(1); });
    const props = first().updates[0];
    expect(props?.scene.id).toBe("s1");
    expect(props?.tokens.map((t) => t.id)).toEqual(["a"]);
    expect(props?.tool).toBe("move");
    expect(props?.imageUrl("img 1")).toBe("/api/worlds/w1/images/img%201");
  });

  it("hands over the tool, the selection, the pointers and the requests for the view", async () => {
    const pointers = new Map([["b", { accountId: "b", username: "Bruno", x: 1, y: 2, at: 3 }]]);
    render(<Board {...baseProps()} tool="select" selectMode="lasso" measureMode="radius" selectedIds={new Set(["a"])} pointers={pointers} viewRequest={{ x: 5, y: 6, zoom: 2, seq: 3 }} resetViewSeq={4} showStart />);
    await waitFor(() => { expect(first().updates).toHaveLength(1); });
    expect(first().updates[0]).toMatchObject({ tool: "select", selectMode: "lasso", measureMode: "radius", showStart: true, resetViewSeq: 4, viewRequest: { seq: 3 } });
    expect([...(first().updates[0]?.selectedIds ?? [])]).toEqual(["a"]);
    expect(first().updates[0]?.pointers.get("b")?.username).toBe("Bruno");
  });

  it("hands over the alignment of the map when there is one", async () => {
    const align = { step: "size" as const, state: { anchor: { x: 100, y: 200 }, size: 80 }, preview: true };
    render(<Board {...baseProps()} align={align} />);
    await waitFor(() => { expect(first().updates).toHaveLength(1); });
    expect(first().updates[0]?.align).toEqual(align);
  });

  it("draws again when the state changes, without making a second canvas", async () => {
    const { rerender } = render(<Board {...baseProps()} />);
    await waitFor(() => { expect(first().updates).toHaveLength(1); });
    rerender(<Board {...baseProps()} tokens={[token("a"), token("b")]} selectedIds={new Set(["b"])} revision={2} tool="select" />);
    await waitFor(() => { expect(first().updates).toHaveLength(2); });
    expect(made).toHaveLength(1);
    expect(first().updates[1]?.tool).toBe("select");
  });

  it("passes everything the person does on to the latest handlers", async () => {
    const one = baseProps();
    const two = baseProps();
    const { rerender } = render(<Board {...one} />);
    await waitFor(() => { expect(made).toHaveLength(1); });
    rerender(<Board {...two} />);
    const c = first().callbacks;
    c.onSelect(["a"]);
    c.onMove([{ id: "a", x: 3, y: 4 }]);
    c.onPointer(10, 20);
    c.onPlaceText({ x: 1, y: 2 }, { x: 30, y: 40 });
    c.onView({ x: 1, y: 2, zoom: 3 });
    c.onAnchor({ x: 5, y: 6 });
    c.onAlign({ anchor: { x: 7, y: 8 }, size: 90 });
    c.onStartZone({ x: 1, y: 2, w: 3, h: 4 });
    expect(two.onStartZone).toHaveBeenCalledWith({ x: 1, y: 2, w: 3, h: 4 });
    expect(two.onAlign).toHaveBeenCalledWith({ anchor: { x: 7, y: 8 }, size: 90 });
    expect(one.onAlign).not.toHaveBeenCalled();
    expect(two.onSelect).toHaveBeenCalledWith(["a"]);
    expect(two.onMove).toHaveBeenCalledWith([{ id: "a", x: 3, y: 4 }]);
    expect(two.onPointer).toHaveBeenCalledWith(10, 20);
    expect(two.onPlaceText).toHaveBeenCalledWith({ x: 1, y: 2 }, { x: 30, y: 40 });
    expect(two.onView).toHaveBeenCalledWith({ x: 1, y: 2, zoom: 3 });
    expect(two.onAnchor).toHaveBeenCalledWith({ x: 5, y: 6 });
    expect(one.onSelect).not.toHaveBeenCalled();
    expect(one.onMove).not.toHaveBeenCalled();
  });

  it("lets the screen ask where the view is and put it somewhere", async () => {
    const ref = createRef<BoardHandle>();
    render(<Board {...baseProps()} ref={ref} />);
    await waitFor(() => { expect(first().updates).toHaveLength(1); });
    expect(ref.current?.getView()).toEqual({ x: 10, y: 20, zoom: 1.5 });
    act(() => { ref.current?.setView({ x: 100, y: 200 }, 2); });
    expect(first().setViews).toEqual([{ center: { x: 100, y: 200 }, zoom: 2 }]);
  });

  it("has no view to give before the canvas is ready", () => {
    hold = true;
    const ref = createRef<BoardHandle>();
    render(<Board {...baseProps()} ref={ref} />);
    expect(ref.current?.getView()).toBeNull();
    expect(() => { ref.current?.setView({ x: 1, y: 1 }, 1); }).not.toThrow();
  });

  it("tears the canvas down when it leaves the screen", async () => {
    const { unmount } = render(<Board {...baseProps()} />);
    await waitFor(() => { expect(first().updates).toHaveLength(1); });
    unmount();
    expect(first().destroyed).toBe(1);
  });

  it("destroys a canvas that was still being made when the screen was left", async () => {
    hold = true;
    const { unmount } = render(<Board {...baseProps()} />);
    unmount();
    finishMaking?.();
    await waitFor(() => { expect(first().destroyed).toBe(1); });
    expect(first().updates).toHaveLength(0);
  });

  it("can be reached with the keyboard, and says how to use it", () => {
    render(<Board {...baseProps()} />);
    const region = screen.getByRole("application", { name: "Mappa della scena" });
    expect(region.getAttribute("tabindex")).toBe("0");
    const help = document.getElementById(region.getAttribute("aria-describedby") ?? "");
    expect(help?.textContent).toContain("Frecce: sposta la vista");
  });

  it("the arrow keys move the view and the plus and minus keys zoom it", async () => {
    render(<Board {...baseProps()} />);
    await waitFor(() => { expect(made).toHaveLength(1); });
    const region = screen.getByRole("application", { name: "Mappa della scena" });
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) fireEvent.keyDown(region, { key });
    expect(first().nudges).toEqual([[KEY_PAN_PX, 0], [-KEY_PAN_PX, 0], [0, KEY_PAN_PX], [0, -KEY_PAN_PX]]);
    fireEvent.keyDown(region, { key: "+" });
    fireEvent.keyDown(region, { key: "=" });
    fireEvent.keyDown(region, { key: "-" });
    expect(first().zooms).toEqual([KEY_ZOOM, KEY_ZOOM, 1 / KEY_ZOOM]);
  });

  it("the zoom keys work by the physical key too, whatever the layout says they type", async () => {
    render(<Board {...baseProps()} />);
    await waitFor(() => { expect(made).toHaveLength(1); });
    const region = screen.getByRole("application", { name: "Mappa della scena" });
    fireEvent.keyDown(region, { key: "unknown", code: "Equal" });
    fireEvent.keyDown(region, { key: "unknown", code: "NumpadAdd" });
    fireEvent.keyDown(region, { key: "unknown", code: "Minus" });
    fireEvent.keyDown(region, { key: "unknown", code: "NumpadSubtract" });
    expect(first().zooms).toEqual([KEY_ZOOM, KEY_ZOOM, 1 / KEY_ZOOM, 1 / KEY_ZOOM]);
  });

  it("other keys, and keys with Ctrl, Cmd or Alt, are left alone", async () => {
    render(<Board {...baseProps()} />);
    await waitFor(() => { expect(made).toHaveLength(1); });
    const region = screen.getByRole("application", { name: "Mappa della scena" });
    fireEvent.keyDown(region, { key: "a" });
    fireEvent.keyDown(region, { key: "ArrowLeft", metaKey: true });
    fireEvent.keyDown(region, { key: "+", ctrlKey: true });
    expect(first().nudges).toEqual([]);
    expect(first().zooms).toEqual([]);
  });

  it("the handle moves and zooms the view too", async () => {
    const ref = createRef<BoardHandle>();
    render(<Board {...baseProps()} ref={ref} />);
    await waitFor(() => { expect(made).toHaveLength(1); });
    act(() => { ref.current?.nudge(5, 6); ref.current?.zoomBy(2); });
    expect(first().nudges).toEqual([[5, 6]]);
    expect(first().zooms).toEqual([2]);
  });
});
