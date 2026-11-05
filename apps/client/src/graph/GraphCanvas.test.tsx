// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buttonNamed } from "../test-helpers";
import { GraphCanvas, type GraphCanvasProps, type GraphEdge, type GraphNode } from "./GraphCanvas";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
// The canvas takes 1000 by 600 pixels, from (0, 0).
beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 1000, height: 600, right: 1000, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });
});

const group = (id: string, label: string, at: { x: number; y: number }, extra: Partial<GraphNode> = {}): GraphNode => ({ id, label, shape: "group", level: "areas", at, count: 2, selected: false, ...extra });
const scene = (id: string, label: string, at: { x: number; y: number }, extra: Partial<GraphNode> = {}): GraphNode => ({ id, label, shape: "scene", level: "scenes", at, selected: false, ...extra });

function setup(over: Partial<GraphCanvasProps> = {}) {
  const handlers = { onSelect: vi.fn(), onEnter: vi.fn(), onMove: vi.fn(), onEdge: vi.fn(), onConnect: vi.fn() };
  render(<GraphCanvas nodes={[]} edges={[]} canEdit fitKey="a" {...handlers} {...over} />);
  const world = (): HTMLElement => screen.getByTestId("graph-world");
  const zoom = (): number => Number(world().dataset["zoom"]);
  return { ...handlers, world, zoom };
}

const firePointer = (target: Element, type: string, x: number, y: number): void => { act(() => { target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true })); }); };

describe("GraphCanvas showing the nodes", () => {
  it("shows each node as a button with its name; a group says its level and what it holds", () => {
    setup({ nodes: [group("g1", "Foresta", { x: 0, y: 0 }, { count: 3 }), scene("s1", "Sala", { x: 300, y: 0 })] });
    const forest = screen.getByRole("button", { name: "Foresta" });
    expect(forest.textContent).toContain("3");
    expect(forest.textContent).toContain("Area");
    expect(screen.getByRole("button", { name: "Sala" })).toBeTruthy();
  });

  it("marks the selected node, a hidden one, and one that waits to be placed", () => {
    setup({ nodes: [group("g1", "Foresta", { x: 0, y: 0 }, { selected: true }), scene("s1", "Sala", { x: 300, y: 0 }, { hidden: true, waiting: true })] });
    expect(screen.getByRole("button", { name: "Foresta" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Sala" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Sala" }).className).toContain("hidden");
    expect(screen.getByText("Da piazzare")).toBeTruthy();
  });

  it("says so when the group is empty", () => {
    setup({ nodes: [], empty: "Questo gruppo è vuoto." });
    expect(screen.getByText("Questo gruppo è vuoto.")).toBeTruthy();
  });

  it("draws the picture of a node when it has one", () => {
    setup({ nodes: [group("g1", "Foresta", { x: 0, y: 0 }, { imageSrc: "/img/1" })] });
    expect(document.querySelector("img.graph-picture")?.getAttribute("src")).toBe("/img/1");
  });
});

describe("GraphCanvas picking and entering", () => {
  it("a click on a node picks it, and a click on the empty sky lets go", () => {
    const { onSelect } = setup({ nodes: [group("g1", "Foresta", { x: 0, y: 0 })] });
    fireEvent.click(screen.getByRole("button", { name: "Foresta" }));
    expect(onSelect).toHaveBeenCalledWith("g1");
    fireEvent.click(screen.getByTestId("graph-sky"));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("a double click on a group goes in, and on a scene it does not", () => {
    const { onEnter } = setup({ nodes: [group("g1", "Foresta", { x: 0, y: 0 }), scene("s1", "Sala", { x: 300, y: 0 })] });
    fireEvent.doubleClick(screen.getByRole("button", { name: "Sala" }));
    expect(onEnter).not.toHaveBeenCalled();
    fireEvent.doubleClick(screen.getByRole("button", { name: "Foresta" }));
    expect(onEnter).toHaveBeenCalledWith("g1");
  });

  it("the picked group has a button to go in, which is also for those who only look", () => {
    const { onEnter } = setup({ canEdit: false, nodes: [group("g1", "Foresta", { x: 0, y: 0 }, { selected: true })] });
    fireEvent.click(buttonNamed("Entra nel gruppo"));
    expect(onEnter).toHaveBeenCalledWith("g1");
  });

  it("the keyboard picks a node with Enter", () => {
    const { onSelect } = setup({ nodes: [group("g1", "Foresta", { x: 0, y: 0 })] });
    fireEvent.keyDown(screen.getByRole("button", { name: "Foresta" }), { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("g1");
  });
});

describe("GraphCanvas moving nodes", () => {
  const nodes = [group("g1", "Foresta", { x: 0, y: 0 })];

  it("a node dragged to another place is put there, by the distance dragged on the graph", () => {
    const { onMove, zoom } = setup({ nodes });
    const node = screen.getByRole("button", { name: "Foresta" });
    firePointer(node, "pointerdown", 500, 300);
    firePointer(node, "pointermove", 600, 380);
    firePointer(node, "pointerup", 600, 380);
    expect(onMove).toHaveBeenCalledTimes(1);
    const call: unknown[] = onMove.mock.calls[0] ?? [];
    expect(call[0]).toBe("g1");
    expect(call[1]).toBeCloseTo(100 / zoom(), 3);
    expect(call[2]).toBeCloseTo(80 / zoom(), 3);
  });

  it("a touch that hardly moves is a click and moves nothing", () => {
    const { onMove, onSelect } = setup({ nodes });
    const node = screen.getByRole("button", { name: "Foresta" });
    firePointer(node, "pointerdown", 500, 300);
    firePointer(node, "pointerup", 501, 301);
    // The browser follows a touch like that with a click.
    fireEvent.click(node);
    expect(onMove).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith("g1");
  });

  it("nothing is moved by a person who only looks", () => {
    const { onMove } = setup({ nodes, canEdit: false });
    const node = screen.getByRole("button", { name: "Foresta" });
    firePointer(node, "pointerdown", 500, 300);
    firePointer(node, "pointermove", 600, 380);
    firePointer(node, "pointerup", 600, 380);
    expect(onMove).not.toHaveBeenCalled();
  });

  it("nothing is moved while the graph is locked, and it can be unlocked", () => {
    const { onMove } = setup({ nodes });
    const lock = buttonNamed("Blocca i nodi");
    fireEvent.click(lock);
    expect(lock.getAttribute("aria-pressed")).toBe("true");
    const node = screen.getByRole("button", { name: "Foresta" });
    firePointer(node, "pointerdown", 500, 300);
    firePointer(node, "pointermove", 600, 380);
    firePointer(node, "pointerup", 600, 380);
    expect(onMove).not.toHaveBeenCalled();
    fireEvent.click(lock);
    firePointer(node, "pointerdown", 500, 300);
    firePointer(node, "pointermove", 600, 380);
    firePointer(node, "pointerup", 600, 380);
    expect(onMove).toHaveBeenCalledTimes(1);
  });
});

describe("GraphCanvas moving around", () => {
  it("the buttons zoom in and out, and put the graph back in view", () => {
    const { zoom } = setup({ nodes: [group("g1", "Foresta", { x: 0, y: 0 })] });
    const start = zoom();
    fireEvent.click(buttonNamed("Ingrandisci"));
    expect(zoom()).toBeGreaterThan(start);
    fireEvent.click(buttonNamed("Rimpicciolisci"));
    fireEvent.click(buttonNamed("Rimpicciolisci"));
    expect(zoom()).toBeLessThan(start);
    fireEvent.click(buttonNamed("Mostra tutto"));
    expect(zoom()).toBeCloseTo(start, 6);
  });

  it("the wheel zooms", () => {
    const { zoom } = setup({ nodes: [group("g1", "Foresta", { x: 0, y: 0 })] });
    const start = zoom();
    fireEvent.wheel(screen.getByTestId("graph-sky"), { deltaY: -200, clientX: 500, clientY: 300 });
    expect(zoom()).toBeGreaterThan(start);
  });

  it("dragging the empty sky moves the view and picks nothing", () => {
    const { world, onSelect } = setup({ nodes: [group("g1", "Foresta", { x: 0, y: 0 })] });
    const before = world().style.transform;
    const sky = screen.getByTestId("graph-sky");
    firePointer(sky, "pointerdown", 100, 100);
    firePointer(sky, "pointermove", 160, 140);
    firePointer(sky, "pointerup", 160, 140);
    expect(world().style.transform).not.toBe(before);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("shows everything again when the group changes", () => {
    const { rerender } = render(<GraphCanvas nodes={[group("g1", "Foresta", { x: 0, y: 0 })]} edges={[]} canEdit fitKey="a" onSelect={vi.fn()} onEnter={vi.fn()} onMove={vi.fn()} onEdge={vi.fn()} onConnect={vi.fn()} />);
    fireEvent.click(buttonNamed("Ingrandisci"));
    fireEvent.click(buttonNamed("Ingrandisci"));
    const zoomed = Number(screen.getByTestId("graph-world").dataset["zoom"]);
    rerender(<GraphCanvas nodes={[group("g2", "Monti", { x: 0, y: 0 })]} edges={[]} canEdit fitKey="b" onSelect={vi.fn()} onEnter={vi.fn()} onMove={vi.fn()} onEdge={vi.fn()} onConnect={vi.fn()} />);
    expect(Number(screen.getByTestId("graph-world").dataset["zoom"])).toBeLessThan(zoomed);
  });
});

describe("GraphCanvas when its size changes", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("keeps what is in the middle in the middle when the room it has grows or shrinks (the details open beside it)", () => {
    let notify: () => void = () => undefined;
    class FakeObserver {
      constructor(callback: () => void) { notify = callback; }
      observe(): void { /* the test calls the callback itself */ }
      disconnect(): void { /* nothing to let go */ }
    }
    vi.stubGlobal("ResizeObserver", FakeObserver);
    const { world } = setup({ nodes: [group("g1", "Foresta", { x: 0, y: 0 })] });
    const before = world().style.transform;
    expect(before).toBe("translate(500px, 300px) scale(1)");
    // The canvas gets 400 pixels narrower and 100 shorter.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 600, height: 500, right: 600, bottom: 500, x: 0, y: 0, toJSON: () => ({}) });
    act(() => { notify(); });
    expect(world().style.transform).toBe("translate(300px, 250px) scale(1)");
  });
});

describe("GraphCanvas keeping the picked node where it is when its size changes", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  /** A canvas whose size changes when the test says so, with a node picked. */
  function resizable(picked: { x: number; y: number }, others: GraphNode[] = []) {
    let notify: () => void = () => undefined;
    class FakeObserver {
      constructor(callback: () => void) { notify = callback; }
      observe(): void { /* the test calls the callback itself */ }
      disconnect(): void { /* nothing to let go */ }
    }
    vi.stubGlobal("ResizeObserver", FakeObserver);
    const nodes = [group("g1", "Foresta", picked, { selected: true }), ...others];
    const { world } = setup({ nodes });
    const size = (width: number, height = 600): void => {
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) });
      act(() => { notify(); });
    };
    return { world, size };
  }

  it("the first click opens the details beside the graph, which gets narrower: the node that was clicked does not move, so the second click of a double click still finds it", () => {
    const { world, size } = resizable({ x: 0, y: 0 });
    expect(world().style.transform).toBe("translate(500px, 300px) scale(1)");
    size(692);
    expect(world().style.transform).toBe("translate(500px, 300px) scale(1)");
  });

  it("a picked node that would fall outside of the narrower room is brought back inside it, no further than it has to", () => {
    // The picked node is on the right, far from the middle; the room is cut to 692.
    const { world, size } = resizable({ x: 400, y: 0 }, [group("g2", "Monti", { x: -400, y: 0 })]);
    const place = (): number => {
      const [, pan, zoom] = /translate\((-?[\d.]+)px.*scale\((-?[\d.]+)\)/.exec(world().style.transform)?.slice(0, 3) ?? [];
      return 400 * Number(zoom ?? "1") + Number(pan ?? "0");
    };
    expect(place()).toBeGreaterThan(692);
    size(692);
    expect(place()).toBeLessThan(692);
    expect(place()).toBeGreaterThan(692 - 150);
  });

  it("when the room grows again, the picked node stays where it is on the screen", () => {
    const { world, size } = resizable({ x: 0, y: 0 });
    size(692);
    size(1000);
    expect(world().style.transform).toBe("translate(500px, 300px) scale(1)");
  });
});

describe("GraphCanvas showing everything again while its size changes", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("does not count a change of size twice when the group changes at the same time (the details close as a group is entered)", () => {
    let notify: () => void = () => undefined;
    class FakeObserver {
      constructor(callback: () => void) { notify = callback; }
      observe(): void { /* the test calls the callback itself */ }
      disconnect(): void { /* nothing to let go */ }
    }
    vi.stubGlobal("ResizeObserver", FakeObserver);
    const props = { edges: [], canEdit: true, onSelect: vi.fn(), onEnter: vi.fn(), onMove: vi.fn(), onEdge: vi.fn(), onConnect: vi.fn() };
    const { rerender } = render(<GraphCanvas nodes={[group("g1", "Foresta", { x: 0, y: 0 })]} fitKey="a" {...props} />);
    const world = (): HTMLElement => screen.getByTestId("graph-world");
    // The details open beside the graph: it gets narrower, and the middle stays in the middle.
    const narrow = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 600, height: 600, right: 600, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });
    act(() => { notify(); });
    expect(world().style.transform).toBe("translate(300px, 300px) scale(1)");
    // A group is entered: the details close, the graph is wide again and shows everything of the new group, in one step.
    narrow.mockReturnValue({ left: 0, top: 0, width: 1000, height: 600, right: 1000, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });
    rerender(<GraphCanvas nodes={[group("g2", "Monti", { x: 0, y: 0 })]} fitKey="b" {...props} />);
    expect(world().style.transform).toBe("translate(500px, 300px) scale(1)");
    // The observer then reports the same change of size: the graph is already there, and nothing moves.
    act(() => { notify(); });
    expect(world().style.transform).toBe("translate(500px, 300px) scale(1)");
  });
});

describe("GraphCanvas connections between scenes", () => {
  const scenes = [scene("s1", "Sala", { x: 0, y: 0 }, { selected: true }), scene("s2", "Cantina", { x: 400, y: 0 })];
  const edges: GraphEdge[] = [{ id: "l1", from: "s1", to: "s2", label: "Botola da Sala a Cantina" }];

  it("a line joins two scenes, with a link on it that can be picked", () => {
    const { onEdge } = setup({ nodes: scenes, edges });
    fireEvent.click(screen.getByRole("button", { name: "Botola da Sala a Cantina" }));
    expect(onEdge).toHaveBeenCalledWith("l1");
    expect(document.querySelectorAll("svg line.graph-edge")).toHaveLength(1);
  });

  it("an edge to a node that is not there is not drawn", () => {
    setup({ nodes: scenes, edges: [{ id: "l9", from: "s1", to: "altrove", label: "Fantasma" }] });
    expect(screen.queryByRole("button", { name: "Fantasma" })).toBeNull();
  });

  it("the picked scene can be linked to another: first the button, then the other scene", () => {
    const { onConnect, onSelect } = setup({ nodes: scenes });
    fireEvent.click(buttonNamed("Collega da scena…"));
    expect(screen.getByRole("status").textContent).toBe("Scegli la scena a cui collegarla.");
    fireEvent.click(screen.getByRole("button", { name: "Cantina" }));
    expect(onConnect).toHaveBeenCalledWith("s1", "s2");
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("Escape and the same scene give up the link, and a group cannot be linked", () => {
    const { onConnect } = setup({ nodes: [...scenes, group("g1", "Foresta", { x: 0, y: 300 })] });
    fireEvent.click(buttonNamed("Collega da scena…"));
    fireEvent.click(screen.getByRole("button", { name: "Sala" }));
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(buttonNamed("Collega da scena…"));
    fireEvent.click(screen.getByRole("button", { name: "Foresta" }));
    expect(onConnect).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("has no way to link for a person who only looks, nor for a picked group", () => {
    setup({ nodes: scenes, canEdit: false });
    expect(screen.queryByRole("button", { name: "Collega da scena…" })).toBeNull();
    cleanup();
    setup({ nodes: [group("g1", "Foresta", { x: 0, y: 0 }, { selected: true })] });
    expect(screen.queryByRole("button", { name: "Collega da scena…" })).toBeNull();
  });
});
