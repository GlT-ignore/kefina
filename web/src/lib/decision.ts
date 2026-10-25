import type { Decision, DriftRun } from "../api";
import { hoursText, num, ukClock, ukDay, ukTime } from "../format";

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export interface DayFacts {
  run: string;
  meanGap: number;
  over: number;
  n: number;
  worstIdx: number;
  h0: number;
  h1: number;
}

export function dayFacts(d: Decision): DayFacts {
  const errs = d.hours.map((h) => h.error_mw);
  return {
    run: d.runs_used[0].publish_time,
    meanGap: mean(errs),
    over: errs.filter((e) => e > 0).length,
    n: errs.length,
    worstIdx: errs.reduce((best, e, i) => (Math.abs(e) > Math.abs(errs[best]) ? i : best), 0),
    h0: d.hours[0].horizon_h,
    h1: d.hours[d.hours.length - 1].horizon_h,
  };
}

/** "Gate closed Tue 27 Jan, 09:20 GMT. You had the 07:30 run, 16.5 to 39.5 hours ahead." */
export function gateSentence(d: Decision): string {
  const f = dayFacts(d);
  const runDay = ukDay(f.run) === ukDay(d.cutoff) ? "" : ` of ${ukDay(f.run)}`;
  // Runs normally go out at half past; anything else was published late.
  const late = f.run.slice(14, 16) === "30" ? "" : ", a late run";
  const extra = d.runs_used.slice(1).map((r) => `the ${ukClock(r.publish_time)} run for ${r.hours} hours`);
  const also = extra.length ? ` (and ${extra.join(", ")})` : "";
  return `Gate closed ${ukDay(d.cutoff)}, ${ukTime(d.cutoff)}. You had the ${ukClock(f.run)} run${runDay}${late}${also}, ${hoursText(f.h0)} to ${hoursText(f.h1)} hours ahead.`;
}

/** Minutes between the run you had and the gate. */
export function runLeadMinutes(d: Decision): number {
  return Math.round((Date.parse(d.cutoff) - Date.parse(d.runs_used[0].publish_time)) / 60000);
}

/** Minutes after midnight on the UK clock. */
export function minutesOf(iso: string): number {
  const [h, m] = ukClock(iso).split(":").map(Number);
  return h * 60 + m;
}

function byPublish(runs: DriftRun[]): DriftRun[] {
  return [...runs].sort((a, b) => a.publish_time.localeCompare(b.publish_time));
}

function runMean(r: DriftRun): number {
  return mean(r.points.map((p) => p.forecast_mw));
}

/** Change in the run's mean against the run before it, over the hours both runs cover. */
export function changeLabel(r: DriftRun, prev: DriftRun | undefined): string {
  if (!prev) return "first run in the log";
  const before = new Map(prev.points.map((p) => [p.start_time, p.forecast_mw]));
  const shared = r.points.filter((p) => before.has(p.start_time));
  const d = mean(shared.map((p) => p.forecast_mw - (before.get(p.start_time) ?? 0)));
  return Math.abs(d) < 1 ? `unchanged from ${ukClock(prev.publish_time)}` : `${num(d, true)} MW vs ${ukClock(prev.publish_time)}`;
}

export interface LogRow {
  run: DriftRun;
  time: string;
  minutes: number;
  mean: number;
  change: string;
  used: boolean;
}

/** The runs published on the gate day, each with how it moved from the run before it. */
export function logRows(d: Decision): { before: LogRow[]; after: LogRow[] } {
  const all = byPublish(d.drift);
  const gateDay = ukDay(d.cutoff);
  const used = d.runs_used[0].publish_time;
  const rows = all
    .map((run, i) => ({ run, prev: all[i - 1] }))
    .filter(({ run }) => ukDay(run.publish_time) === gateDay)
    .map(({ run, prev }) => ({
      run,
      time: ukClock(run.publish_time),
      minutes: minutesOf(run.publish_time),
      mean: runMean(run),
      change: changeLabel(run, prev),
      used: run.publish_time === used,
    }));
  return { before: rows.filter((r) => !r.run.after_gate), after: rows.filter((r) => r.run.after_gate) };
}

export interface DriftRow {
  run: DriftRun;
  value?: number;
  used: boolean;
}

/** Every run's forecast for one delivery hour, in publish order. */
export function hourDrift(d: Decision, hourIdx: number) {
  const hour = d.hours[hourIdx];
  const used = d.runs_used[0].publish_time;
  const rows: DriftRow[] = byPublish(d.drift).map((run) => ({
    run,
    value: run.points.find((p) => p.start_time === hour.start_time)?.forecast_mw,
    used: run.publish_time === used,
  }));
  const pre = rows.filter((r) => !r.run.after_gate && r.value !== undefined).map((r) => r.value as number);
  return {
    hour,
    rows,
    firstLate: rows.findIndex((r) => r.run.after_gate),
    preRange: pre.length ? ([Math.min(...pre), Math.max(...pre)] as const) : undefined,
    usedValue: rows.find((r) => r.used)?.value,
  };
}
