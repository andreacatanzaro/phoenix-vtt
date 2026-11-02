import { describe, expect, it } from "vitest";
import { MINUTES_PER_HOUR, advanceTime, gameTime, hoursBetween, minutesBetween } from "./game-time";

describe("gameTime", () => {
  it("counts whole minutes since the start of the world", () => {
    expect(gameTime(0)).toEqual({ minutes: 0 });
    expect(gameTime(90)).toEqual({ minutes: 90 });
  });

  it("rejects negative, fractional and non-finite values", () => {
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => gameTime(bad), String(bad)).toThrow();
  });
});

describe("advanceTime", () => {
  it("moves the clock forward and leaves the original alone", () => {
    const start = gameTime(100);
    expect(advanceTime(start, 60)).toEqual({ minutes: 160 });
    expect(start).toEqual({ minutes: 100 });
  });

  it("accepts zero and rejects going back", () => {
    expect(advanceTime(gameTime(5), 0)).toEqual({ minutes: 5 });
    expect(() => advanceTime(gameTime(5), -1)).toThrow();
    expect(() => advanceTime(gameTime(5), 0.5)).toThrow();
  });
});

describe("minutesBetween and hoursBetween", () => {
  it("measure the time from an earlier to a later instant", () => {
    expect(minutesBetween(gameTime(60), gameTime(150))).toBe(90);
    expect(hoursBetween(gameTime(0), gameTime(MINUTES_PER_HOUR * 24))).toBe(24);
    expect(hoursBetween(gameTime(0), gameTime(90))).toBe(1.5);
  });

  it("refuses an end before the start", () => {
    expect(() => minutesBetween(gameTime(10), gameTime(5))).toThrow();
  });

  it("is JSON serializable", () => {
    expect(JSON.parse(JSON.stringify(gameTime(42)))).toEqual(gameTime(42));
  });
});
