import { describe, expect, it } from "vitest";
import { isMessageKey } from "@phoenix/shared";
import { SKILLS, skillAbility } from "./skills";

describe("SKILLS", () => {
  it("has an Italian name in the catalog for every skill", () => {
    for (const id of Object.keys(SKILLS)) expect(isMessageKey(`skills.${id}`), id).toBe(true);
  });

  it("has the 18 SRD skills", () => {
    expect(Object.keys(SKILLS)).toHaveLength(18);
  });

  it("uses kebab-case English ids", () => {
    for (const id of Object.keys(SKILLS)) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it("links each skill to its SRD ability", () => {
    const expected: Record<string, string> = {
      acrobatics: "dex", "animal-handling": "wis", arcana: "int", athletics: "str", deception: "cha",
      history: "int", insight: "wis", intimidation: "cha", investigation: "int", medicine: "wis",
      nature: "int", perception: "wis", performance: "cha", persuasion: "cha", religion: "int",
      "sleight-of-hand": "dex", stealth: "dex", survival: "wis",
    };
    expect(Object.keys(expected)).toHaveLength(18);
    for (const [id, ability] of Object.entries(SKILLS)) {
      expect(ability, id).toBe(expected[id]);
    }
    expect(skillAbility("stealth")).toBe("dex");
  });
});
