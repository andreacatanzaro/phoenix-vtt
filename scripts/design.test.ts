import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The client has one look (AGENTS.md, "Design del client"). Colors, typefaces and decorations live in `style.css`
 * and `decor.css`; components only use their classes and variables. This keeps every new screen in the same style.
 */
const src = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "client", "src");
const files = readdirSync(src);
const components = files.filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"));

describe("client design rules", () => {
  it("finds the components it checks", () => {
    expect(components.length).toBeGreaterThan(8);
  });

  it("components write no color by hand: they use the variables", () => {
    for (const file of components) {
      const code = readFileSync(join(src, file), "utf8");
      expect(code.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [], `${file}: hex color`).toEqual([]);
      expect(code.match(/\b(?:rgb|rgba|hsl|hsla)\(/g) ?? [], `${file}: color function`).toEqual([]);
    }
  });

  it("components choose no typeface and no font size by hand", () => {
    for (const file of components) {
      const code = readFileSync(join(src, file), "utf8");
      expect(code.match(/fontFamily|font-family/g) ?? [], `${file}: typeface`).toEqual([]);
      expect(code.match(/fontSize\s*:\s*["'`]?\d/g) ?? [], `${file}: font size`).toEqual([]);
    }
  });

  it("inline styles only use layout values or the design variables", () => {
    for (const file of components) {
      const code = readFileSync(join(src, file), "utf8");
      for (const style of code.matchAll(/style=\{\{([^}]*)\}\}/g)) {
        const body = style[1] ?? "";
        for (const colorUse of body.matchAll(/\b(color|background|border\w*)\s*:\s*([^,}]+)/g)) {
          expect(colorUse[2] ?? "", `${file}: ${colorUse[0]}`).toMatch(/var\(--[a-z0-9-]+\)/);
        }
      }
    }
  });

  it("the style sheets define the palette and the three typefaces the components rely on", () => {
    const css = readFileSync(join(src, "style.css"), "utf8");
    for (const name of ["--notte", "--lavagna", "--traccia", "--osso", "--nebbia", "--oro", "--verderame", "--brace", "--display", "--ui", "--flavor"]) {
      expect(css, name).toContain(`${name}:`);
    }
    expect(css).toContain('"Cinzel"');
    expect(css).toContain('"Inter"');
    expect(css).toContain('"Lora"');
  });

  it("the sign-in page and the main screens use the shared classes, not their own", () => {
    for (const file of ["LoginPage.tsx", "WorldsPage.tsx", "WorldPage.tsx", "AtlasPanel.tsx", "SessionsPanel.tsx", "MembersPanel.tsx"]) {
      const code = readFileSync(join(src, file), "utf8");
      expect(code, file).toMatch(/className=/);
    }
  });
});
