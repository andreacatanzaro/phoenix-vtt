// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolColumn } from "./ToolColumn";
import { TOOLS } from "./table/tools";

afterEach(cleanup);

const noop = (): void => undefined;

describe("ToolColumn", () => {
  it("has a button for each tool it is given, with the key in the hint", () => {
    render(<ToolColumn tools={TOOLS} tool="move" onTool={noop} collapsed={false} onCollapse={noop} />);
    const bar = screen.getByRole("toolbar", { name: "Strumenti" });
    expect(bar.querySelectorAll("button")).toHaveLength(TOOLS.length);
    expect(screen.getByRole("button", { name: "Sposta" }).getAttribute("data-tip")).toBe("Sposta (W)");
    expect(screen.getByRole("button", { name: "Seleziona" }).getAttribute("data-tip")).toBe("Seleziona (S)");
    expect(screen.getByRole("button", { name: "Misura" }).getAttribute("data-tip")).toBe("Misura (M)");
    expect(screen.getByRole("button", { name: "Puntatore" }).getAttribute("data-tip")).toBe("Puntatore (Q)");
    expect(screen.getByRole("button", { name: "Testo" }).getAttribute("data-tip")).toBe("Testo (T)");
  });

  it("only shows the tools it is given", () => {
    render(<ToolColumn tools={["move", "select"]} tool="move" onTool={noop} collapsed={false} onCollapse={noop} />);
    expect(screen.queryByRole("button", { name: "Testo" })).toBeNull();
    expect(screen.getAllByRole("button").length).toBe(3);
  });

  it("marks the tool in use, and only that one", () => {
    render(<ToolColumn tools={TOOLS} tool="measure" onTool={noop} collapsed={false} onCollapse={noop} />);
    expect(screen.getByRole("button", { name: "Misura" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Sposta" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("picks a tool on click", () => {
    const onTool = vi.fn();
    render(<ToolColumn tools={TOOLS} tool="move" onTool={onTool} collapsed={false} onCollapse={noop} />);
    fireEvent.click(screen.getByRole("button", { name: "Puntatore" }));
    expect(onTool).toHaveBeenCalledWith("pointer");
  });

  it("folds away with the arrow above it, and the arrow says whether it is open", () => {
    const onCollapse = vi.fn();
    const { rerender } = render(<ToolColumn tools={TOOLS} tool="move" onTool={noop} collapsed={false} onCollapse={onCollapse} />);
    const arrow = screen.getByRole("button", { name: "Mostra o nascondi gli strumenti" });
    expect(arrow.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(arrow);
    expect(onCollapse).toHaveBeenCalled();
    rerender(<ToolColumn tools={TOOLS} tool="move" onTool={noop} collapsed onCollapse={onCollapse} />);
    expect(screen.queryByRole("toolbar", { name: "Strumenti" })).toBeNull();
    expect(screen.getByRole("button", { name: "Mostra o nascondi gli strumenti" }).getAttribute("aria-expanded")).toBe("false");
  });
});
