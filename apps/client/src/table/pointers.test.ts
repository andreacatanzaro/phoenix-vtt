import { describe, expect, it } from "vitest";
import { colorOf, livePointers, movePointer, POINTER_LIFETIME_MS, type RemotePointer } from "./pointers";

const anna = { accountId: "anna", username: "Anna" };
const bruno = { accountId: "bruno", username: "Bruno" };

describe("colorOf", () => {
  it("is the same for the same person, and never black, white or grey", () => {
    expect(colorOf("anna")).toBe(colorOf("anna"));
    for (const id of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]) expect(["black", "white", "grey"]).not.toContain(colorOf(id));
  });

  it("gives different people different colors, at least sometimes", () => {
    const colors = new Set(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].map(colorOf));
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe("movePointer", () => {
  it("replaces the old position of a person and keeps the others", () => {
    let book = new Map<string, RemotePointer>();
    book = movePointer(book, anna, 1, 2, 100);
    book = movePointer(book, bruno, 5, 6, 110);
    book = movePointer(book, anna, 3, 4, 120);
    expect([...book.values()].map((p) => `${p.username}@${String(p.x)},${String(p.y)}`)).toEqual(["Anna@3,4", "Bruno@5,6"]);
  });

  it("puts a pointer away when the position is null, and does not change the book it was given", () => {
    const first = movePointer(new Map(), anna, 1, 2, 0);
    const after = movePointer(first, anna, null, null, 1);
    expect(after.size).toBe(0);
    expect(first.size).toBe(1);
  });
});

describe("livePointers", () => {
  it("drops a pointer that has been still too long", () => {
    let book = new Map<string, RemotePointer>();
    book = movePointer(book, anna, 1, 1, 0);
    book = movePointer(book, bruno, 2, 2, 3000);
    expect(livePointers(book, POINTER_LIFETIME_MS - 1).map((p) => p.username)).toEqual(["Anna", "Bruno"]);
    expect(livePointers(book, POINTER_LIFETIME_MS).map((p) => p.username)).toEqual(["Bruno"]);
    expect(livePointers(book, 10000)).toEqual([]);
  });
});
