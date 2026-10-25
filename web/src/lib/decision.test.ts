import { describe, expect, it } from "vitest";

import type { Decision, DriftRun } from "../api";
import { changeLabel, dayFacts, gateSentence, hourDrift, logRows, minutesOf, runLeadMinutes } from "./decision";

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
    run("2026-01-26T22:30:00Z", [1000, 900, 1200]),
    run("2026-01-27T04:30:00Z", [800, 700]),
  ],
};

describe("day facts", () => {
  it("averages the gap and finds the largest hour", () => {
    const f = dayFacts(decision);
    expect(f.meanGap).toBeCloseTo((200 - 100 + 600) / 3);
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
});

describe("bulletin log", () => {
  it("compares each run with the one before over shared hours", () => {
    expect(changeLabel(run("a", [1000, 900]), undefined)).toBe("first run in the log");
    expect(changeLabel(run("2026-01-27T07:30:00Z", [1000, 900]), run("2026-01-27T04:30:00Z", [1000, 900, 5]))).toBe("unchanged from 04:30");
    expect(changeLabel(run("2026-01-27T07:30:00Z", [1100, 1000]), run("2026-01-27T04:30:00Z", [1000, 900]))).toBe("+100 MW vs 04:30");
  });

  it("keeps only gate-day runs, split at the gate", () => {
    const { before, after } = logRows(decision);
    expect(before.map((r) => r.time)).toEqual(["04:30", "07:30"]);
    expect(before.map((r) => r.change)).toEqual(["-200 MW vs 22:30", "+200 MW vs 04:30"]);
    expect(before[1].used).toBe(true);
    expect(after.map((r) => [r.time, r.change])).toEqual([["09:30", "-33 MW vs 07:30"]]);
    expect(minutesOf("2026-01-27T09:20:00Z")).toBe(560);
  });
});

describe("drift for one hour", () => {
  it("lists every run in publish order with the pre-gate range", () => {
    const d = hourDrift(decision, 2);
    expect(d.rows.map((r) => r.value)).toEqual([1200, undefined, 1200, 1000]);
    expect(d.firstLate).toBe(3);
    expect(d.preRange).toEqual([1200, 1200]);
    expect(d.usedValue).toBe(1200);
  });
});
