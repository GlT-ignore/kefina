import { describe, expect, it } from "vitest";

import { linear, mwAxis, slotIndex, stepBands, stepPath } from "./chart";

describe("scales", () => {
  it("maps a domain onto pixels, inverted for y", () => {
    const y = linear(0, 100, 200, 0);
    expect(y(0)).toBe(200);
    expect(y(25)).toBe(150);
  });

  it("rounds the MW axis out to a readable step from zero", () => {
    expect(mwAxis([5509, 15208])).toEqual({ bottom: 0, top: 16000, ticks: [0, 4000, 8000, 12000, 16000] });
    expect(mwAxis([-1500, 5000])).toEqual({ bottom: -2000, top: 6000, ticks: [-2000, 0, 2000, 4000, 6000] });
  });

  it("finds the slot under a position and clamps outside the plot", () => {
    expect(slotIndex(10, 10, 110, 4)).toBe(0);
    expect(slotIndex(59, 10, 110, 4)).toBe(1);
    expect(slotIndex(60, 10, 110, 4)).toBe(2);
    expect(slotIndex(-40, 10, 110, 4)).toBe(0);
    expect(slotIndex(110, 10, 110, 4)).toBe(3);
  });
});

describe("step paths", () => {
  const x = (i: number) => i * 10;
  const y = (v: number) => 100 - v;

  it("holds each value across its slot and lifts the pen over a gap", () => {
    expect(stepPath([10, 20], x, y)).toBe("M0.0 90.0H10.0V80.0H20.0");
    expect(stepPath([10, undefined, 30], x, y)).toBe("M0.0 90.0H10.0M20.0 70.0H30.0");
    expect(stepPath([undefined], x, y)).toBe("");
  });

  it("boxes the gap between two step lines, slot by slot", () => {
    expect(stepBands([50, 40], [20, 45], x, y)).toBe("M0.0 50.0H10.0V80.0H0.0ZM10.0 60.0H20.0V55.0H10.0Z");
  });
});
