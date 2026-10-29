import { describe, expect, it } from "vitest";

import type { Decision, DriftRun } from "../api";
import { dayFacts, gateSentence, hourSpan, longDay, rollNote, runLeadMinutes, runLines, worstLabel } from "./decision";

const run = (publish: string, values: number[], afterGate = false): DriftRun => ({
  publish_time: publish,
  after_gate: afterGate,
  points: values.map((v, i) => ({ start_time: `2026-01-28T0${i}:00:00Z`, forecast_mw: v })),
});

const hour = (i: number, forecast: number, actual: number, horizon: number) => ({
  start_time: `2026-01-28T0${i}:00:00Z`,
  publish_time: "2026-01-27T07:30:00Z",
  horizon_h: horizon,
  forecast_mw: forecast,
  actual_mw: actual,
  error_mw: forecast - actual,
});

const decision: Decision = {
  day: "2026-01-28",
  gate: "epex_0920",
  cutoff: "2026-01-27T09:20:00Z",
  runs_used: [{ publish_time: "2026-01-27T07:30:00Z", hours: 3 }],
  hours: [hour(0, 1000, 800, 16.5), hour(1, 900, 1000, 17.5), hour(2, 1200, 600, 18.5)],
  drift: [
    run("2026-01-27T09:30:00Z", [1000, 1000, 1000], true),
    run("2026-01-27T07:30:00Z", [1000, 900, 1200]),
    run("2026-01-27T11:30:00Z", [1000, 900], true),
    run("2026-01-26T22:30:00Z", [1000, 900]),
  ],
};

describe("day facts", () => {
  it("averages the gap, signed and absolute, and finds the largest hour", () => {
    const f = dayFacts(decision);
    expect(f.meanGap).toBeCloseTo((200 - 100 + 600) / 3);
    expect(f.meanAbs).toBeCloseTo((200 + 100 + 600) / 3);
    expect(f.over).toBe(2);
    expect(f.worstIdx).toBe(2);
    expect([f.h0, f.h1]).toEqual([16.5, 18.5]);
  });

  it("names the run the buyer had", () => {
    expect(gateSentence(decision)).toBe("Gate closed Tue 27 Jan, 09:20 GMT. You had the 07:30 run, 16.5 to 18.5 hours ahead.");
    expect(runLeadMinutes(decision)).toBe(110);
  });

  it("flags a late run and a run from the day before", () => {
    const late = { ...decision, runs_used: [{ publish_time: "2026-01-27T12:25:00Z", hours: 3 }], cutoff: "2026-01-27T15:30:00Z" };
    expect(gateSentence(late)).toContain("You had the 12:25 run, a late run, 16.5");
    const early = { ...decision, runs_used: [{ publish_time: "2026-01-26T22:30:00Z", hours: 3 }] };
    expect(gateSentence(early)).toContain("the 22:30 run of Mon 26 Jan,");
  });

  it("ranks the worst days in words", () => {
    expect(worstLabel(0, "January", "09:20")).toBe("The worst January day at 09:20");
    expect(worstLabel(2, "January", "15:30")).toBe("Third worst January day at 15:30");
    expect(worstLabel(-1, "January", "09:20")).toBe("");
  });

  it("names the delivery day in full", () => {
    expect(longDay("2026-01-28")).toBe("Wednesday 28 January");
  });

  it("spans an hour on the UK clock", () => {
    expect(hourSpan("2026-01-28T04:00:00Z")).toBe("04:00 to 05:00 GMT");
    expect(hourSpan("2026-01-28T23:00:00Z")).toBe("23:00 to 00:00 GMT");
  });
});

describe("runs", () => {
  it("lines every run up against the delivery hours, in publish order", () => {
    const lines = runLines(decision);
    expect(lines.map((l) => [l.time.slice(11, 16), l.after])).toEqual([
      ["22:30", false],
      ["07:30", false],
      ["09:30", true],
      ["11:30", true],
    ]);
    expect(lines[0].values).toEqual([1000, 900, undefined]);
  });

  it("says where an hour's forecast went after the gate", () => {
    const lines = runLines(decision);
    expect(rollNote(decision, lines, 0)).toBe("By Tue 27 Jan, 11:30, the forecast for 00:00 had not moved from the run you had. Metered wind came in at 800 MW.");
    expect(rollNote(decision, lines, 2)).toBe("By Tue 27 Jan, 09:30, the forecast for 02:00 had moved to 1,000 MW, 200 MW below the run you had. Metered wind came in at 600 MW.");
    expect(rollNote(decision, lines.slice(0, 2), 0)).toBe("");
  });
});
