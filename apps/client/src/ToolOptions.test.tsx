// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolOptions } from "./ToolOptions";
import type { Tool } from "./table/tools";

afterEach(cleanup);

function setup(tool: Tool, extra: { selectMode?: "rectangle" | "lasso"; measureMode?: "ruler" | "radius" } = {}) {
  const onSelectMode = vi.fn();
  const onMeasureMode = vi.fn();
  const { container } = render(<ToolOptions tool={tool} selectMode={extra.selectMode ?? "rectangle"} onSelectMode={onSelectMode} measureMode={extra.measureMode ?? "ruler"} onMeasureMode={onMeasureMode} />);
  return { container, onSelectMode, onMeasureMode };
}

describe("ToolOptions", () => {
  it("shows nothing for the tools that have no options", () => {
    for (const tool of ["move", "pointer", "text"] as const) {
      const { container } = setup(tool);
      expect(container.firstChild).toBeNull();
      cleanup();
    }
  });

  it("offers rectangle and lasso for Select, marks the one in use and switches", () => {
    const { onSelectMode } = setup("select", { selectMode: "lasso" });
    expect(screen.getByRole("button", { name: "Selezione a rettangolo" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Selezione a mano libera" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Selezione a rettangolo" }));
    expect(onSelectMode).toHaveBeenCalledWith("rectangle");
  });

  it("offers ruler and radius for Measure, marks the one in use and switches", () => {
    const { onMeasureMode } = setup("measure");
    expect(screen.getByRole("button", { name: "Righello" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Raggio" }));
    expect(onMeasureMode).toHaveBeenCalledWith("radius");
  });
});
