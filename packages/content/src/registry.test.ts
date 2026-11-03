import { isMessageKey } from "@phoenix/shared";
import { describe, expect, it } from "vitest";
import { contentClasses } from "./registry";

describe("content registry", () => {
  it("class and subclass ids are unique, and each subclass points at its class", () => {
    const classIds = contentClasses.map((c) => c.class.id);
    expect(new Set(classIds).size).toBe(classIds.length);
    for (const entry of contentClasses) {
      const ids = entry.subclasses.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const sub of entry.subclasses) expect(sub.classId).toBe(entry.class.id);
    }
  });

  it("every text key of every class, subclass and feature exists in the Italian catalog", () => {
    for (const { class: cls, subclasses, options } of contentClasses) {
      const owners = [cls, ...subclasses];
      const keys = [
        cls.nameKey,
        ...subclasses.flatMap((s) => [s.nameKey, s.descriptionKey]),
        ...options.flatMap((o) => [o.nameKey, o.descriptionKey, ...(o.dmNoteKey === undefined ? [] : [o.dmNoteKey])]),
      ];
      for (const owner of owners) {
        for (const f of owner.features) keys.push(f.nameKey, f.descriptionKey, ...(f.dmNoteKey === undefined ? [] : [f.dmNoteKey]));
      }
      for (const key of keys) expect(isMessageKey(key), key).toBe(true);
    }
  });

  it("every feature that is not fully automated says what the DM resolves", () => {
    for (const { class: cls, subclasses, options } of contentClasses) {
      for (const o of options) if (o.automation !== "full") expect(o.dmNoteKey, o.id).toBeDefined();
      for (const owner of [cls, ...subclasses]) {
        for (const f of owner.features) if (f.automation !== "full") expect(f.dmNoteKey, f.id).toBeDefined();
      }
    }
  });
});
