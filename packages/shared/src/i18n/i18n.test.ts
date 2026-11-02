import { describe, expect, it } from "vitest";
import { it as catalog } from "./it";
import { isMessageKey, messageKeys, renderLogLine, translate, t, type MessageKey } from "./index";

describe("catalog", () => {
  it("has the log keys emitted by rules-core", () => {
    for (const key of ["log.effect.expired", "log.effect.round-passed", "log.dm.override", "log.step.unexplained"]) {
      expect(isMessageKey(key), key).toBe(true);
    }
  });

  it("lists every leaf as a dotted key", () => {
    expect(messageKeys()).toContain("common.yes");
    expect(messageKeys()).toContain("log.effect.expired");
  });

  it("writes every placeholder as {name} with a plain identifier", () => {
    const leaves = messageKeys().map((key) => translate(key, undefined, { lenient: true }));
    for (const text of leaves) {
      const braces = text.match(/[{}]/g) ?? [];
      const placeholders = text.match(/\{[a-zA-Z][a-zA-Z0-9]*\}/g) ?? [];
      expect(braces.length, text).toBe(placeholders.length * 2);
    }
  });

  it("is written in Italian, not left as keys", () => {
    expect(catalog.common.yes).toBe("Sì");
  });
});

describe("t", () => {
  it("fills named parameters", () => {
    expect(t("log.effect.expired", { effect: "shield", target: "Aria" })).toBe("L'effetto shield su Aria è terminato.");
  });

  it("returns text without placeholders as is", () => {
    expect(t("common.no")).toBe("No");
  });

  it("throws when a parameter is missing", () => {
    expect(() => t("log.effect.expired", { effect: "shield" })).toThrow();
  });

  it("ignores parameters the text does not use", () => {
    expect(t("common.yes", { extra: 1 })).toBe("Sì");
  });

  it("rejects keys that are not in the catalog at compile time", () => {
    // @ts-expect-error unknown key
    const call = (): string => t("log.does.not.exist");
    expect(call).toThrow();
  });
});

describe("translate", () => {
  it("renders a key coming from the engine at runtime", () => {
    const fromEngine: string = "log.dm.override";
    expect(translate(fromEngine, { kind: "set-value", target: "roll" })).toContain("set-value");
  });

  it("throws for an unknown runtime key", () => {
    expect(() => translate("nope.nothing")).toThrow();
  });

  it("treats a branch of the catalog as unknown, not as text", () => {
    expect(() => translate("log")).toThrow();
  });

  it("is typed so MessageKey accepts only leaves", () => {
    const ok: MessageKey = "common.yes";
    expect(ok).toBe("common.yes");
  });
});

describe("renderLogLine", () => {
  const actorName = (id: string): string => (id === "hero" ? "Aria" : id);

  it("resolves text keys and actor ids before filling the template", () => {
    const line = {
      key: "log.effect.expired",
      params: { effect: "common.yes", target: "hero" },
      refs: { effect: "text-key", target: "actor-id" } as const,
    };
    expect(renderLogLine(line, actorName)).toBe("L'effetto Sì su Aria è terminato.");
  });

  it("leaves unmarked params as they are", () => {
    const line = { key: "log.step.unexplained", params: { step: "shield-reaction" } };
    expect(renderLogLine(line, actorName)).toBe("Il passo shield-reaction ha modificato lo stato senza una spiegazione.");
  });

  it("fails when a reference points to an unknown text key", () => {
    const line = { key: "log.effect.expired", params: { effect: "nope", target: "hero" }, refs: { effect: "text-key" } as const };
    expect(() => renderLogLine(line, actorName)).toThrow();
  });
});
