import { describe, expect, it } from "vitest";

import { bandPath, linear, linePath, mwAxis, nearestIndex, sparkPath } from "./chart";

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

  it("finds the nearest slot and clamps outside the plot", () => {
    expect(nearestIndex(55, 10, 110, 5)).toBe(2);
    expect(nearestIndex(-40, 10, 110, 5)).toBe(0);
    expect(nearestIndex(400, 10, 110, 5)).toBe(4);
  });
});

describe("paths", () => {
  it("draws lines and the band between two lines", () => {
    expect(linePath([[0, 10], [5, 0]])).toBe("M0.0 10.0L5.0 0.0");
    expect(bandPath([[0, 1], [2, 1]], [[0, 3], [2, 4]])).toBe("M0.0 1.0L2.0 1.0L2.0 4.0L0.0 3.0Z");
  });

  it("scales a sparkline to its own range", () => {
    expect(sparkPath([10, 20], 100, 24)).toBe("M0.0 22.0L100.0 2.0");
  });
});
