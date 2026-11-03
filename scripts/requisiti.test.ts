import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const doc = readFileSync(join(root, "docs", "REQUISITI.md"), "utf8");

/** Every path in backticks that looks like a test or a project file the table points to. */
const references = [...doc.matchAll(/`((?:apps|packages|docs|\.github)\/[^`\s]+)`/g)].map((m) => m[1] ?? "");

describe("docs/REQUISITI.md", () => {
  it("cites at least the tests of the first wave", () => {
    expect(references.filter((r) => r.endsWith(".test.ts") || r.endsWith(".test.tsx")).length).toBeGreaterThan(20);
  });

  it("only cites files that exist", () => {
    const missing = references.filter((r) => !existsSync(join(root, r)));
    expect(missing).toEqual([]);
  });

  it("every requirement has a state and a test column", () => {
    const rows = doc.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Requisito") && !l.startsWith("| ---"));
    expect(rows.length).toBeGreaterThan(40);
    for (const row of rows) {
      expect(row.split("|").length, row).toBe(6);
      expect(row).toMatch(/\| (fatto|parziale|da fare)/);
    }
  });
});
