import { describe, expect, it } from "vitest";

import { PHASE, printed, seg } from "./scene";

describe("scene progress", () => {
  it("maps progress onto a stretch and clamps outside it", () => {
    expect(seg(0.25, 0, 0.5)).toBe(0.5);
    expect(seg(-1, 0, 0.5)).toBe(0);
    expect(seg(2, 0, 0.5)).toBe(1);
  });

  it("keeps the steps in order inside 0 to 1", () => {
    const order = [PHASE.printA, PHASE.printB, PHASE.perfB, PHASE.tearB, PHASE.rollB, PHASE.stampA, PHASE.stampB];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order[0]).toBeGreaterThan(0);
    expect(order[order.length - 1]).toBeLessThan(1);
  });

  it("prints lines one after another", () => {
    expect(printed(2, 0, 1, 0)).toEqual({ fr: [0, 0], last: -1, live: 0 });
    const mid = printed(2, 0, 1, 0.2);
    expect(mid.fr[0]).toBeCloseTo(0.5);
    expect([mid.fr[1], mid.last, mid.live]).toEqual([0, 0, mid.fr[0]]);
    expect(printed(2, 0, 1, 1)).toEqual({ fr: [1, 1], last: 1, live: 1 });
    expect(printed(0, 0, 1, 1)).toEqual({ fr: [], last: -1, live: 0 });
  });
});
