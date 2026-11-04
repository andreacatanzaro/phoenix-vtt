import { describe, expect, it } from "vitest";
import { SerialQueue } from "./serial-queue";

const pause = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

describe("SerialQueue", () => {
  it("never runs two jobs of the same key at once, and keeps the order they came in", async () => {
    const q = new SerialQueue();
    const log: string[] = [];
    const job = (name: string, ms: number) => async (): Promise<void> => {
      log.push(`start ${name}`);
      await pause(ms);
      log.push(`end ${name}`);
    };
    await Promise.all([q.run("s", job("a", 20)), q.run("s", job("b", 1)), q.run("s", job("c", 5))]);
    expect(log).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
  });

  it("lets different keys run side by side", async () => {
    const q = new SerialQueue();
    const log: string[] = [];
    await Promise.all([
      q.run("one", async () => { log.push("one start"); await pause(20); log.push("one end"); }),
      q.run("two", async () => { log.push("two start"); await pause(1); log.push("two end"); }),
    ]);
    expect(log).toEqual(["one start", "two start", "two end", "one end"]);
  });

  it("hands back each job's own result or failure", async () => {
    const q = new SerialQueue();
    await expect(q.run("s", () => Promise.resolve(42))).resolves.toBe(42);
    await expect(q.run("s", () => Promise.reject(new Error("no")))).rejects.toThrow("no");
  });

  it("a failing job does not stop the ones behind it", async () => {
    const q = new SerialQueue();
    const failing = q.run("s", () => Promise.reject(new Error("boom")));
    const after = q.run("s", () => Promise.resolve("still runs"));
    await expect(failing).rejects.toThrow("boom");
    await expect(after).resolves.toBe("still runs");
  });

  it("counts the jobs running or waiting for a key", async () => {
    const q = new SerialQueue();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const a = q.run("s", () => gate);
    const b = q.run("s", () => Promise.resolve());
    expect(q.depth("s")).toBe(2);
    expect(q.depth("other")).toBe(0);
    release();
    await Promise.all([a, b]);
    await pause(0);
    expect(q.depth("s")).toBe(0);
  });

  it("forgets a key once nothing is waiting", async () => {
    const q = new SerialQueue();
    await q.run("s", () => Promise.resolve());
    await pause(0);
    expect(q.busy).toBe(0);
  });
});
