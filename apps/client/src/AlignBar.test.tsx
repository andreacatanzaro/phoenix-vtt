// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AlignBar } from "./AlignBar";
import { buttonNamed, fakeServer } from "./test-helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const url = "PATCH /api/worlds/w1/scenes/s1/table";
const SAVED = { scene: { mapImageId: null, mapWidth: null, mapHeight: null, gridPx: 90, gridOffsetX: 5, gridOffsetY: 72, start: { x: 2, y: 2, w: 3, h: 2 } } };

function setup(over: Partial<Parameters<typeof AlignBar>[0]> = {}, routes: Record<string, { status: number; body?: unknown }[]> = { [url]: [{ status: 200, body: SAVED }] }) {
  const server = fakeServer(routes);
  const handlers = { onStep: vi.fn(), onPreview: vi.fn(), onCancel: vi.fn(), onDone: vi.fn() };
  render(<AlignBar worldId="w1" sceneId="s1" step="offset" state={{ anchor: { x: 905, y: 612 }, size: 90 }} preview={false} {...handlers} {...over} />);
  return { server, ...handlers };
}

describe("AlignBar", () => {
  it("shows the three steps in order and the one in use", () => {
    setup({ step: "size" });
    expect(buttonNamed("1. Spostamento").getAttribute("aria-pressed")).toBe("false");
    expect(buttonNamed("2. Dimensione").getAttribute("aria-pressed")).toBe("true");
    expect(buttonNamed("3. Rifinitura").getAttribute("aria-pressed")).toBe("false");
  });

  it("says what to do in the step and what the grid would be", () => {
    setup({ step: "refine" });
    expect(screen.getByRole("status").textContent).toContain("Sposta gli incroci che non coincidono con la mappa");
    expect(screen.getByRole("status").textContent).toContain("Quadretto 90 px, spostamento 5 e 72");
  });

  it("changes step, and turns the preview of the grid on and off", () => {
    const { onStep, onPreview } = setup();
    fireEvent.click(buttonNamed("3. Rifinitura"));
    expect(onStep).toHaveBeenCalledWith("refine");
    fireEvent.click(screen.getByRole("checkbox", { name: "Anteprima della griglia" }));
    expect(onPreview).toHaveBeenCalledWith(true);
  });

  it("applies by saving the size and the offset on the scene, and then it is done", async () => {
    const { server, onDone } = setup();
    fireEvent.click(buttonNamed("Applica"));
    await waitFor(() => { expect(onDone).toHaveBeenCalledTimes(1); });
    expect(server.bodies[url]).toEqual([{ gridPx: 90, gridOffsetX: 5, gridOffsetY: 72 }]);
  });

  it("stays open and says so when the save fails", async () => {
    const { onDone } = setup({}, { [url]: [{ status: 500 }] });
    fireEvent.click(buttonNamed("Applica"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("gives up without saving anything", () => {
    const { server, onCancel } = setup();
    fireEvent.click(buttonNamed("Annulla"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(server.calls).toEqual([]);
  });
});
