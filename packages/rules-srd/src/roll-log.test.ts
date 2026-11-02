import { createScriptedRng, rollD20, rollDice } from "@phoenix/rules-core";
import { isMessageKey, renderLogLine } from "@phoenix/shared";
import { describe, expect, it } from "vitest";
import { rollLogLine } from "./roll-log";

describe("rollLogLine", () => {
  it("records dice, kept dice, modifier, total and mode", () => {
    const roll = rollD20({ modifier: 3, mode: "advantage" }, createScriptedRng([4, 15]));
    expect(rollLogLine(roll)).toEqual({
      key: "log.roll.detail",
      params: { notation: "1d20+3", mode: "roll.mode.advantage", dice: "4, 15", kept: "15", modifier: "+3", total: 18 },
      refs: { mode: "text-key" },
    });
  });

  it("writes negative and zero modifiers with their sign", () => {
    expect(rollLogLine(rollD20({ modifier: -2, mode: "normal" }, createScriptedRng([9]))).params["modifier"]).toBe("-2");
    expect(rollLogLine(rollDice("2d6", createScriptedRng([3, 4]))).params["modifier"]).toBe("+0");
  });

  it("renders as readable Italian through the catalog", () => {
    const roll = rollDice("4d6kh3", createScriptedRng([2, 6, 5, 4]));
    const line = rollLogLine(roll);
    expect(isMessageKey(line.key)).toBe(true);
    expect(renderLogLine(line, (id) => id)).toBe("Tiro 4d6kh3 (normale): dadi [2, 6, 5, 4], tenuti [6, 5, 4], modificatore +0, totale 15.");
  });
});
