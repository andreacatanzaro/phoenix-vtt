// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardCallbacks, BoardProps } from "./table/board-view";
import { scene, token } from "./table/fixtures";

type Made = { updates: BoardProps[]; destroyed: number; callbacks: BoardCallbacks };
const made: Made[] = [];
let finishMaking: (() => void) | null = null;
let hold = false;

vi.mock("./table/board-view", () => ({
  BoardView: {
    create: (_host: HTMLElement, callbacks: BoardCallbacks) => {
      const board: Made & { update: (p: BoardProps) => void; destroy: () => void } = {
        updates: [],
        destroyed: 0,
        callbacks,
        update(p) { this.updates.push(p); },
        destroy() { this.destroyed += 1; },
      };
      made.push(board);
      return new Promise((resolve) => {
        if (hold) finishMaking = () => { resolve(board); };
        else resolve(board);
      });
    },
  },
}));

import { Board } from "./Board";

beforeEach(() => {
  made.length = 0;
  finishMaking = null;
  hold = false;
});
afterEach(cleanup);

const baseProps = { worldId: "w1", scene, tokens: [token("a")], me: { accountId: "anna", role: "player" as const }, selectedId: null, showStart: false, revision: 1, onSelect: vi.fn(), onMove: vi.fn() };

function first(): Made {
  const board = made[0];
  if (board === undefined) throw new Error("no board was made");
  return board;
}

describe("Board", () => {
  it("is a labelled region the canvas goes into", () => {
    render(<Board {...baseProps} />);
    expect(screen.getByRole("application", { name: "Mappa della scena" })).toBeTruthy();
  });

  it("draws what it is given, with the address of the pictures of this world", async () => {
    render(<Board {...baseProps} />);
    await waitFor(() => { expect(first().updates).toHaveLength(1); });
    const props = first().updates[0];
    expect(props?.scene.id).toBe("s1");
    expect(props?.tokens.map((t) => t.id)).toEqual(["a"]);
    expect(props?.imageUrl("img 1")).toBe("/api/worlds/w1/images/img%201");
  });

  it("draws again when the state changes, without making a second canvas", async () => {
    const { rerender } = render(<Board {...baseProps} />);
    await waitFor(() => { expect(first().updates).toHaveLength(1); });
    rerender(<Board {...baseProps} tokens={[token("a"), token("b")]} selectedId="b" revision={2} />);
    await waitFor(() => { expect(first().updates).toHaveLength(2); });
    expect(made).toHaveLength(1);
    expect(first().updates[1]?.selectedId).toBe("b");
  });

  it("passes touches on to the latest handlers", async () => {
    const one = { ...baseProps, onSelect: vi.fn(), onMove: vi.fn() };
    const two = { ...baseProps, onSelect: vi.fn(), onMove: vi.fn() };
    const { rerender } = render(<Board {...one} />);
    await waitFor(() => { expect(made).toHaveLength(1); });
    rerender(<Board {...two} />);
    first().callbacks.onSelect("a");
    first().callbacks.onMove("a", 3, 4);
    expect(two.onSelect).toHaveBeenCalledWith("a");
    expect(two.onMove).toHaveBeenCalledWith("a", 3, 4);
    expect(one.onSelect).not.toHaveBeenCalled();
  });

  it("tears the canvas down when it leaves the screen", async () => {
    const { unmount } = render(<Board {...baseProps} />);
    await waitFor(() => { expect(first().updates).toHaveLength(1); });
    unmount();
    expect(first().destroyed).toBe(1);
  });

  it("destroys a canvas that was still being made when the screen was left", async () => {
    hold = true;
    const { unmount } = render(<Board {...baseProps} />);
    unmount();
    finishMaking?.();
    await waitFor(() => { expect(first().destroyed).toBe(1); });
    expect(first().updates).toHaveLength(0);
  });
});
