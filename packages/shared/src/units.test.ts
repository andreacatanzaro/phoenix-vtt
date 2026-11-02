import { describe, expect, it } from "vitest";
import {
  CELL_METERS,
  FALL_MAX_DICE,
  FALL_METERS_PER_DIE,
  carryCapacityKg,
  cellsToMeters,
  coinsToKg,
  fallDice,
  feetToMeters,
  liftCapacityKg,
  metersToCells,
  poundsToKg,
} from "./units";

describe("distance", () => {
  it("uses 1.5 m cells", () => {
    expect(CELL_METERS).toBe(1.5);
    expect(cellsToMeters(1)).toBe(1.5);
    expect(cellsToMeters(6)).toBe(9);
    expect(metersToCells(9)).toBe(6);
    expect(metersToCells(4.5)).toBe(3);
  });

  it("converts SRD feet at 1 ft = 0.3 m without float drift", () => {
    expect(feetToMeters(5)).toBe(1.5);
    expect(feetToMeters(15)).toBe(4.5);
    expect(feetToMeters(30)).toBe(9);
    expect(feetToMeters(60)).toBe(18);
    expect(feetToMeters(120)).toBe(36);
  });

  it("keeps round trips between cells and meters exact for whole cells", () => {
    for (let cells = 0; cells <= 200; cells++) {
      expect(metersToCells(cellsToMeters(cells))).toBe(cells);
    }
  });

  it("rejects values that are not finite numbers", () => {
    expect(() => feetToMeters(Number.NaN)).toThrow();
    expect(() => cellsToMeters(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe("weight", () => {
  it("converts pounds at 0.5 kg", () => {
    expect(poundsToKg(1)).toBe(0.5);
    expect(poundsToKg(15)).toBe(7.5);
  });

  it("weighs a coin 10 g, so 50 coins match one SRD pound", () => {
    expect(coinsToKg(1)).toBe(0.01);
    expect(coinsToKg(50)).toBe(poundsToKg(1));
    expect(coinsToKg(1000)).toBe(10);
  });

  it("rejects negative weights", () => {
    expect(() => poundsToKg(-1)).toThrow();
    expect(() => coinsToKg(-5)).toThrow();
  });
});

describe("capacity", () => {
  it("carries Strength x 7.5 kg", () => {
    expect(carryCapacityKg(10)).toBe(75);
    expect(carryCapacityKg(15)).toBe(112.5);
  });

  it("lifts, pushes and drags Strength x 15 kg", () => {
    expect(liftCapacityKg(10)).toBe(150);
    expect(liftCapacityKg(30)).toBe(450);
  });

  it("accepts only whole Strength scores from 1 to 30", () => {
    for (const bad of [0, 31, 10.5, -3, Number.NaN]) {
      expect(() => carryCapacityKg(bad), String(bad)).toThrow();
      expect(() => liftCapacityKg(bad), String(bad)).toThrow();
    }
    expect(carryCapacityKg(1)).toBe(7.5);
    expect(carryCapacityKg(30)).toBe(225);
  });
});

describe("falling", () => {
  it("deals 1d6 for every full 3 m", () => {
    expect(FALL_METERS_PER_DIE).toBe(3);
    expect(fallDice(0)).toBe(0);
    expect(fallDice(2.9)).toBe(0);
    expect(fallDice(3)).toBe(1);
    expect(fallDice(8.9)).toBe(2);
    expect(fallDice(9)).toBe(3);
  });

  it("caps the damage at 20d6", () => {
    expect(FALL_MAX_DICE).toBe(20);
    expect(fallDice(60)).toBe(20);
    expect(fallDice(600)).toBe(20);
  });

  it("rejects negative or non-finite heights", () => {
    expect(() => fallDice(-1)).toThrow();
    expect(() => fallDice(Number.NaN)).toThrow();
  });
});
