import { describe, expect, it } from "vitest";
import { FrameGate } from "./frame-gate";

describe("FrameGate", () => {
  it("lets frames through up to the limit, then refuses", () => {
    const gate = new FrameGate(3, 1000, 100);
    expect([0, 1, 2, 3].map((t) => gate.admit(t))).toEqual(["run", "run", "run", "refuse"]);
  });

  it("lets frames through again once the window has passed", () => {
    const gate = new FrameGate(2, 1000, 100);
    gate.admit(0);
    gate.admit(1);
    expect(gate.admit(2)).toBe("refuse");
    expect(gate.admit(2000)).toBe("run");
  });

  it("hangs up on someone who keeps pushing after being refused", () => {
    const gate = new FrameGate(2, 1000, 100);
    gate.admit(0);
    gate.admit(0);
    const answers = Array.from({ length: 5 }, () => gate.admit(1));
    expect(answers).toEqual(["refuse", "refuse", "close", "close", "close"]);
  });

  it("forgives refusals once the person is back within the limit", () => {
    const gate = new FrameGate(2, 1000, 100);
    gate.admit(0);
    gate.admit(0);
    gate.admit(1);
    expect(gate.admit(5000)).toBe("run");
    gate.admit(5000);
    expect([gate.admit(5001), gate.admit(5001)]).toEqual(["refuse", "refuse"]);
  });

  it("hangs up when too many frames are waiting, whatever the rate", () => {
    const gate = new FrameGate(1000, 1000, 3);
    expect([gate.admit(0), gate.admit(1), gate.admit(2), gate.admit(3)]).toEqual(["run", "run", "run", "close"]);
  });

  it("room opens again as frames finish", () => {
    const gate = new FrameGate(1000, 1000, 2);
    gate.admit(0);
    gate.admit(1);
    gate.finished();
    expect(gate.admit(2)).toBe("run");
    gate.finished();
    gate.finished();
    gate.finished();
    expect(gate.admit(3)).toBe("run");
  });
});
