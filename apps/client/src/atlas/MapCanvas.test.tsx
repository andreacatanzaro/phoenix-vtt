// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MAX_POLYGON_POINTS } from "@phoenix/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buttonNamed } from "../test-helpers";
import { MapCanvas, type MapCanvasProps } from "./MapCanvas";

afterEach(cleanup);

// The picture takes 400 by 200 pixels, from (100, 50).
beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ left: 100, top: 50, width: 400, height: 200, right: 500, bottom: 250, x: 100, y: 50, toJSON: () => ({}) });
});
afterEach(() => { vi.restoreAllMocks(); });

const square = [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 }, { x: 0.1, y: 0.5 }];

function setup(over: Partial<MapCanvasProps> = {}) {
  const handlers = { onShape: vi.fn(), onPin: vi.fn(), onDrawn: vi.fn(), onPlaced: vi.fn(), onRefused: vi.fn(), onMovePin: vi.fn(), onArrow: vi.fn(), onLink: vi.fn(), onShapeEdited: vi.fn() };
  render(<MapCanvas src="/img/1" alt="Mappa" mode={{ kind: "view" }} {...handlers} {...over} />);
  const surface = screen.getByTestId("atlas-map");
  return { ...handlers, surface };
}

describe("MapCanvas in view", () => {
  it("shows the picture, the areas and the pins, each with its name", () => {
    setup({ shapes: [{ id: "a1", label: "Foresta", polygon: square, selected: false }], pins: [{ id: "p1", label: "Locanda", at: { x: 0.3, y: 0.3 }, selected: false, kind: "place" }] });
    expect(screen.getByRole("img", { name: "Mappa" }).getAttribute("src")).toBe("/img/1");
    expect(screen.getByRole("button", { name: "Foresta" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Locanda" })).toBeTruthy();
  });

  it("a click on an area or on a pin says which", () => {
    const { onShape, onPin } = setup({ shapes: [{ id: "a1", label: "Foresta", polygon: square, selected: false }], pins: [{ id: "p1", label: "Locanda", at: { x: 0.3, y: 0.3 }, selected: false, kind: "place" }] });
    fireEvent.click(screen.getByRole("button", { name: "Foresta" }));
    fireEvent.click(screen.getByRole("button", { name: "Locanda" }));
    expect(onShape).toHaveBeenCalledWith("a1");
    expect(onPin).toHaveBeenCalledWith("p1");
  });

  it("fills a shape the way a pin is checked against it: a part that crosses itself twice is empty, in the drawing as in the check", () => {
    setup({ shapes: [{ id: "a1", label: "Stella", polygon: square, selected: false }] });
    expect(screen.getByRole("button", { name: "Stella" }).getAttribute("fill-rule")).toBe("evenodd");
  });

  it("the Enter key does the same as a click, for those who do not use the mouse", () => {
    const { onShape, onPin } = setup({ shapes: [{ id: "a1", label: "Foresta", polygon: square, selected: false }], pins: [{ id: "p1", label: "Locanda", at: { x: 0.3, y: 0.3 }, selected: false, kind: "place" }] });
    fireEvent.keyDown(screen.getByRole("button", { name: "Foresta" }), { key: "Enter" });
    expect(onShape).toHaveBeenCalledWith("a1");
    fireEvent.keyDown(screen.getByRole("button", { name: "Locanda" }), { key: "Enter" });
    expect(onPin).toHaveBeenCalledWith("p1");
  });

  it("marks the area and the pin that are selected", () => {
    setup({ shapes: [{ id: "a1", label: "Foresta", polygon: square, selected: true }], pins: [{ id: "p1", label: "Locanda", at: { x: 0.3, y: 0.3 }, selected: true, kind: "scene" }] });
    expect(screen.getByRole("button", { name: "Foresta" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Locanda" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("puts a pin where its fractions say", () => {
    setup({ pins: [{ id: "p1", label: "Locanda", at: { x: 0.25, y: 0.75 }, selected: false, kind: "place" }] });
    const style = screen.getByRole("button", { name: "Locanda" }).getAttribute("style") ?? "";
    expect(style).toContain("left: 25%");
    expect(style).toContain("top: 75%");
  });

  it("a pin that can be moved is dragged to a new place, and a short touch is still a click", () => {
    const { onMovePin, onPin } = setup({ pins: [{ id: "p1", label: "Locanda", at: { x: 0.3, y: 0.3 }, selected: false, kind: "place" }], movable: true });
    const pin = screen.getByRole("button", { name: "Locanda" });
    const fire = (type: string, x: number, y: number): void => { pin.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true })); };
    fire("pointerdown", 220, 110);
    fire("pointermove", 300, 150);
    fire("pointerup", 300, 150);
    expect(onMovePin).toHaveBeenCalledWith("p1", { x: 0.5, y: 0.5 });
    fire("pointerdown", 220, 110);
    fire("pointerup", 221, 110);
    expect(onPin).toHaveBeenCalledWith("p1");
  });

  it("a pin cannot be dragged unless the map says it can", () => {
    const { onMovePin } = setup({ pins: [{ id: "p1", label: "Locanda", at: { x: 0.3, y: 0.3 }, selected: false, kind: "place" }] });
    const pin = screen.getByRole("button", { name: "Locanda" });
    pin.dispatchEvent(new MouseEvent("pointerdown", { clientX: 220, clientY: 110, bubbles: true }));
    pin.dispatchEvent(new MouseEvent("pointermove", { clientX: 300, clientY: 150, bubbles: true }));
    pin.dispatchEvent(new MouseEvent("pointerup", { clientX: 300, clientY: 150, bubbles: true }));
    expect(onMovePin).not.toHaveBeenCalled();
  });
});

describe("MapCanvas arrows (the exits between scenes)", () => {
  const pins = [
    { id: "s1", label: "Sala", at: { x: 0.2, y: 0.5 }, selected: false, kind: "scene" as const },
    { id: "s2", label: "Cantina", at: { x: 0.8, y: 0.5 }, selected: false, kind: "scene" as const },
  ];
  const arrows = [{ id: "l1", from: { x: 0.2, y: 0.5 }, to: { x: 0.8, y: 0.5 }, label: "Uscita da Sala verso Cantina", selected: false }];

  it("draws an arrow for each exit, which is picked by its name", () => {
    const { onArrow } = setup({ pins, arrows });
    fireEvent.click(screen.getByRole("button", { name: "Uscita da Sala verso Cantina" }));
    expect(onArrow).toHaveBeenCalledWith("l1");
  });

  it("both ways of a reciprocal exit can be picked: each has its own place on the map", () => {
    const both = [
      { id: "l1", from: { x: 0.2, y: 0.5 }, to: { x: 0.8, y: 0.5 }, label: "Uscita da Sala verso Cantina", selected: false },
      { id: "l2", from: { x: 0.8, y: 0.5 }, to: { x: 0.2, y: 0.5 }, label: "Uscita da Cantina verso Sala", selected: false },
    ];
    const { onArrow } = setup({ pins, arrows: both });
    const hit = (label: string): number => Number(screen.getByRole("button", { name: label }).querySelector(".atlas-arrow-hit")?.getAttribute("y1"));
    expect(hit("Uscita da Sala verso Cantina")).not.toBeCloseTo(hit("Uscita da Cantina verso Sala"), 3);
    fireEvent.click(screen.getByRole("button", { name: "Uscita da Sala verso Cantina" }));
    fireEvent.click(screen.getByRole("button", { name: "Uscita da Cantina verso Sala" }));
    expect(onArrow).toHaveBeenNthCalledWith(1, "l1");
    expect(onArrow).toHaveBeenNthCalledWith(2, "l2");
  });

  it("an exit that has no reciprocal stays on the line between its two pins", () => {
    setup({ pins, arrows });
    expect(Number(screen.getByRole("button", { name: "Uscita da Sala verso Cantina" }).querySelector(".atlas-arrow-hit")?.getAttribute("y1"))).toBeCloseTo(0.5, 6);
  });

  it("an arrow too short to see is left out", () => {
    setup({ pins, arrows: [{ id: "l2", from: { x: 0.5, y: 0.5 }, to: { x: 0.51, y: 0.5 }, label: "Corta", selected: false }] });
    expect(screen.queryByRole("button", { name: "Corta" })).toBeNull();
  });

  it("the Enter key picks an arrow too", () => {
    const { onArrow } = setup({ pins, arrows });
    fireEvent.keyDown(screen.getByRole("button", { name: "Uscita da Sala verso Cantina" }), { key: "Enter" });
    expect(onArrow).toHaveBeenCalledWith("l1");
  });

  it("marks the arrow that is selected", () => {
    setup({ pins, arrows: [{ id: "l1", from: { x: 0.2, y: 0.5 }, to: { x: 0.8, y: 0.5 }, label: "Uscita da Sala verso Cantina", selected: true }] });
    expect(screen.getByRole("button", { name: "Uscita da Sala verso Cantina" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("linking: the first pin picked is the start, the second is the end, and that makes the exit", () => {
    const { onLink } = setup({ pins, mode: { kind: "link" } });
    fireEvent.click(screen.getByRole("button", { name: "Sala" }));
    expect(screen.getByRole("button", { name: "Sala" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Cantina" }));
    expect(onLink).toHaveBeenCalledWith("s1", "s2");
    expect(screen.getByRole("button", { name: "Sala" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("picking the same pin twice takes the start back", () => {
    const { onLink } = setup({ pins, mode: { kind: "link" } });
    fireEvent.click(screen.getByRole("button", { name: "Sala" }));
    fireEvent.click(screen.getByRole("button", { name: "Sala" }));
    fireEvent.click(screen.getByRole("button", { name: "Cantina" }));
    expect(onLink).not.toHaveBeenCalled();
  });

  it("while linking, a click on the picture does nothing and the pins are not simply picked", () => {
    const { surface, onLink, onPin, onPlaced } = setup({ pins, mode: { kind: "link" } });
    fireEvent.click(surface, { clientX: 300, clientY: 150 });
    fireEvent.click(screen.getByRole("button", { name: "Sala" }));
    expect(onPlaced).not.toHaveBeenCalled();
    expect(onPin).not.toHaveBeenCalled();
    expect(onLink).not.toHaveBeenCalled();
  });

  it("the drawing takes the shape of the picture once it is loaded, so arrows and areas are not stretched", () => {
    render(<MapCanvas src="/img/1" alt="Mappa larga" mode={{ kind: "view" }} />);
    const picture = screen.getByRole("img", { name: "Mappa larga" });
    expect(document.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 1 1");
    Object.defineProperty(picture, "naturalWidth", { value: 2000, configurable: true });
    Object.defineProperty(picture, "naturalHeight", { value: 1000, configurable: true });
    fireEvent.load(picture);
    expect(document.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 2 1");
  });
});

describe("MapCanvas showing what is about to be made", () => {
  it("shows a shape and a pin that wait for a name, without being something to pick", () => {
    const { onShape, onPin } = setup({ ghost: { polygon: square, pin: { x: 0.25, y: 0.75 } } });
    expect(document.querySelector(".atlas-ghost")).not.toBeNull();
    const pin = screen.getByTestId("atlas-ghost-pin");
    expect(pin.getAttribute("style")).toContain("left: 25%");
    expect(pin.getAttribute("style")).toContain("top: 75%");
    expect(screen.queryByRole("button", { name: /Nuovo/ })).toBeNull();
    fireEvent.click(pin);
    expect(onShape).not.toHaveBeenCalled();
    expect(onPin).not.toHaveBeenCalled();
  });

  it("shows nothing when nothing waits", () => {
    setup({});
    expect(document.querySelector(".atlas-ghost")).toBeNull();
    expect(screen.queryByTestId("atlas-ghost-pin")).toBeNull();
  });
});

describe("MapCanvas moving the points of a shape", () => {
  const shapes = [{ id: "a1", label: "Foresta", polygon: square, selected: true }];
  const handle = (n: number): HTMLElement => screen.getByRole("button", { name: `Punto ${String(n)} di Foresta` });
  const fire = (target: HTMLElement, type: string, x: number, y: number): void => { target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true })); };

  it("offers a handle on each point of the shape being edited, and none otherwise", () => {
    setup({ shapes, mode: { kind: "edit", shapeId: "a1" } });
    expect([1, 2, 3, 4].map((n) => handle(n).getAttribute("style"))).toEqual(["left: 10%; top: 10%;", "left: 50%; top: 10%;", "left: 50%; top: 50%;", "left: 10%; top: 50%;"]);
    cleanup();
    setup({ shapes });
    expect(screen.queryByRole("button", { name: "Punto 1 di Foresta" })).toBeNull();
  });

  it("a point dragged to another place gives the new shape, with the other points where they were", () => {
    const { onShapeEdited } = setup({ shapes, mode: { kind: "edit", shapeId: "a1" } });
    // The first point is at (140, 70) on the screen; it is taken to (220, 130).
    fire(handle(1), "pointerdown", 140, 70);
    fire(handle(1), "pointermove", 220, 130);
    fire(handle(1), "pointerup", 220, 130);
    expect(onShapeEdited).toHaveBeenCalledWith("a1", [{ x: 0.3, y: 0.4 }, square[1], square[2], square[3]]);
  });

  it("a touch that hardly moves changes nothing", () => {
    const { onShapeEdited } = setup({ shapes, mode: { kind: "edit", shapeId: "a1" } });
    fire(handle(2), "pointerdown", 300, 70);
    fire(handle(2), "pointerup", 301, 71);
    expect(onShapeEdited).not.toHaveBeenCalled();
  });

  it("a point cannot be taken off the picture", () => {
    const { onShapeEdited } = setup({ shapes, mode: { kind: "edit", shapeId: "a1" } });
    fire(handle(3), "pointerdown", 300, 150);
    fire(handle(3), "pointermove", 900, 900);
    fire(handle(3), "pointerup", 900, 900);
    expect(onShapeEdited).toHaveBeenCalledWith("a1", [square[0], square[1], { x: 1, y: 1 }, square[3]]);
  });

  it("shows the shape as it is dragged", async () => {
    setup({ shapes, mode: { kind: "edit", shapeId: "a1" } });
    fire(handle(1), "pointerdown", 140, 70);
    fire(handle(1), "pointermove", 220, 130);
    await waitFor(() => { expect(screen.getByRole("button", { name: "Foresta" }).getAttribute("points")).toBe("0.3,0.4 0.5,0.1 0.5,0.5 0.1,0.5"); });
  });

  it("while editing, a click on the picture or on a point draws nothing, so the next drawing does not begin with stray points", () => {
    const { surface, onDrawn, onPlaced } = setup({ shapes, mode: { kind: "edit", shapeId: "a1" } });
    fireEvent.click(surface, { clientX: 200, clientY: 100 });
    fireEvent.click(handle(1), { clientX: 140, clientY: 70 });
    expect(onDrawn).not.toHaveBeenCalled();
    expect(onPlaced).not.toHaveBeenCalled();
    const first = render(<MapCanvas src="/img/1" alt="Mappa" shapes={shapes} mode={{ kind: "edit", shapeId: "a1" }} />);
    fireEvent.click(screen.getAllByTestId("atlas-map")[1] ?? surface, { clientX: 200, clientY: 100 });
    first.rerender(<MapCanvas src="/img/1" alt="Mappa" shapes={shapes} mode={{ kind: "draw" }} />);
    expect(screen.queryAllByTestId("atlas-draft-point")).toHaveLength(0);
  });

  it("a point cannot be dragged while the last change is being saved, and says so by being off", () => {
    const { onShapeEdited } = setup({ shapes, mode: { kind: "edit", shapeId: "a1" }, locked: true });
    expect(buttonNamed("Punto 1 di Foresta").disabled).toBe(true);
    fire(handle(1), "pointerdown", 140, 70);
    fire(handle(1), "pointermove", 220, 130);
    fire(handle(1), "pointerup", 220, 130);
    expect(onShapeEdited).not.toHaveBeenCalled();
  });

  it("while editing, the areas are not picked", () => {
    const { onShape } = setup({ shapes, mode: { kind: "edit", shapeId: "a1" } });
    fireEvent.click(screen.getByRole("button", { name: "Foresta" }));
    expect(onShape).not.toHaveBeenCalled();
  });
});

describe("MapCanvas drawing an area", () => {
  const click = (surface: HTMLElement, x: number, y: number): void => { fireEvent.click(surface, { clientX: x, clientY: y }); };

  it("takes a point for each click and closes with the button once there are three", () => {
    const { surface, onDrawn } = setup({ mode: { kind: "draw" } });
    expect(buttonNamed("Chiudi la forma").disabled).toBe(true);
    click(surface, 140, 70);
    click(surface, 340, 70);
    click(surface, 340, 190);
    fireEvent.click(screen.getByRole("button", { name: "Chiudi la forma" }));
    expect(onDrawn).toHaveBeenCalledWith([{ x: 0.1, y: 0.1 }, { x: 0.6, y: 0.1 }, { x: 0.6, y: 0.7 }]);
  });

  it("closes when the first point is clicked again", () => {
    const { surface, onDrawn } = setup({ mode: { kind: "draw" } });
    click(surface, 140, 70);
    click(surface, 340, 70);
    click(surface, 340, 190);
    click(surface, 141, 71);
    expect(onDrawn).toHaveBeenCalledTimes(1);
    expect(onDrawn.mock.calls[0]?.[0]).toHaveLength(3);
  });

  it("stops taking points at the biggest number a shape may have, says so, and keeps what was drawn so it can be closed", () => {
    const { surface, onDrawn } = setup({ mode: { kind: "draw" } });
    // The first point, then others far from it (a click near the first one would close the shape).
    click(surface, 110, 60);
    for (let i = 1; i < MAX_POLYGON_POINTS - 1; i++) click(surface, 150 + i * 5, i % 2 === 0 ? 60 : 160);
    expect(screen.queryByText(/al massimo/)).toBeNull();
    click(surface, 150 + (MAX_POLYGON_POINTS - 1) * 5, 160);
    expect(screen.getAllByTestId("atlas-draft-point")).toHaveLength(MAX_POLYGON_POINTS);
    click(surface, 300, 100);
    expect(screen.getAllByTestId("atlas-draft-point")).toHaveLength(MAX_POLYGON_POINTS);
    expect(screen.getByRole("status").textContent).toBe(`Una forma può avere al massimo ${String(MAX_POLYGON_POINTS)} punti: chiudila o ricomincia.`);
    fireEvent.click(buttonNamed("Chiudi la forma"));
    expect(onDrawn.mock.calls[0]?.[0]).toHaveLength(MAX_POLYGON_POINTS);
  });

  it("can start again", () => {
    const { surface, onDrawn } = setup({ mode: { kind: "draw" } });
    click(surface, 140, 70);
    click(surface, 340, 70);
    fireEvent.click(screen.getByRole("button", { name: "Ricomincia" }));
    click(surface, 140, 70);
    click(surface, 340, 70);
    click(surface, 340, 190);
    fireEvent.click(screen.getByRole("button", { name: "Chiudi la forma" }));
    expect(onDrawn.mock.calls[0]?.[0]).toHaveLength(3);
  });

  it("does not keep a shape for another drawing: the points are dropped when the mode ends", () => {
    const first = render(<MapCanvas src="/img/1" alt="Mappa" mode={{ kind: "draw" }} />);
    click(screen.getByTestId("atlas-map"), 140, 70);
    first.rerender(<MapCanvas src="/img/1" alt="Mappa" mode={{ kind: "view" }} />);
    first.rerender(<MapCanvas src="/img/1" alt="Mappa" mode={{ kind: "draw" }} />);
    expect(buttonNamed("Chiudi la forma").disabled).toBe(true);
    expect(screen.queryAllByTestId("atlas-draft-point")).toHaveLength(0);
  });
});

describe("MapCanvas placing a pin", () => {
  it("a click places it", () => {
    const { surface, onPlaced } = setup({ mode: { kind: "pin" } });
    fireEvent.click(surface, { clientX: 300, clientY: 150 });
    expect(onPlaced).toHaveBeenCalledWith({ x: 0.5, y: 0.5 });
  });

  it("inside an area, a click outside it is refused and says so", () => {
    const { surface, onPlaced, onRefused } = setup({ mode: { kind: "pin", inside: square } });
    fireEvent.click(surface, { clientX: 480, clientY: 240 });
    expect(onPlaced).not.toHaveBeenCalled();
    expect(onRefused).toHaveBeenCalledTimes(1);
    fireEvent.click(surface, { clientX: 200, clientY: 100 });
    expect(onPlaced).toHaveBeenCalledWith({ x: 0.25, y: 0.25 });
  });
});
