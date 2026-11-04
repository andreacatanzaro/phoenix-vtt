// @vitest-environment jsdom
import { TOKEN_COLORS } from "@phoenix/shared";
import { afterEach, describe, expect, it } from "vitest";
import { parseColor, readPalette } from "./palette";

afterEach(() => {
  document.documentElement.removeAttribute("style");
});

describe("parseColor", () => {
  it("reads long and short hex colors, with spaces around", () => {
    expect(parseColor("#e8a530")).toBe(0xe8a530);
    expect(parseColor(" #FFF ")).toBe(0xffffff);
    expect(parseColor("#0af")).toBe(0x00aaff);
  });

  it("gives grey for anything it does not understand", () => {
    for (const bad of ["", "red", "rgb(1,2,3)", "#12", "#1234567"]) expect(parseColor(bad)).toBe(0x808080);
  });
});

describe("readPalette", () => {
  it("takes every color from the design variables", () => {
    const root = document.documentElement;
    root.style.setProperty("--notte", "#101318");
    root.style.setProperty("--oro", "#e8a530");
    root.style.setProperty("--ui", "Inter, sans-serif");
    for (const name of TOKEN_COLORS) root.style.setProperty(`--tk-${name}`, "#010203");
    root.style.setProperty("--tk-green", "#46b58f");
    const palette = readPalette();
    expect(palette.night).toBe(0x101318);
    expect(palette.gold).toBe(0xe8a530);
    expect(palette.tokens.green).toBe(0x46b58f);
    expect(palette.tokens.red).toBe(0x010203);
    expect(palette.ui).toBe("Inter, sans-serif");
  });

  it("falls back to grey and a generic typeface when the variables are missing", () => {
    const palette = readPalette();
    expect(palette.night).toBe(0x808080);
    expect(palette.ui).toBe("sans-serif");
  });
});
