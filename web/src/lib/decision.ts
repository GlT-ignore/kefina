import type { Decision } from "../api";
import { hoursText, mw, ukClock, ukDay, ukTime } from "../format";

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

const longDayLabel = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long" });

/** "Wednesday 28 January" */
export function longDay(iso: string): string {
  return longDayLabel.format(new Date(iso));
}

export interface DayFacts {
  run: string;
  meanGap: number;
  meanAbs: number;
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
    meanAbs: mean(errs.map(Math.abs)),
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

export interface RunLine {
  time: string;
  after: boolean;
  /** The run's forecast for each delivery hour, undefined where the run does not reach that hour. */
  values: (number | undefined)[];
}

/** Every run published in the two days before delivery, in publish order. */
export function runLines(d: Decision): RunLine[] {
  return [...d.drift]
    .sort((a, b) => a.publish_time.localeCompare(b.publish_time))
    .map((r) => {
      const at = new Map(r.points.map((p) => [p.start_time, p.forecast_mw]));
      return { time: r.publish_time, after: r.after_gate, values: d.hours.map((h) => at.get(h.start_time)) };
    });
}

const RANK = ["The worst", "Second worst", "Third worst", "Fourth worst", "Fifth worst"];

/** "The worst January day at 09:20" for rank 0, empty outside the ranked days. */
export function worstLabel(rank: number, month: string, gateTime: string): string {
  return rank >= 0 && rank < RANK.length ? `${RANK[rank]} ${month} day at ${gateTime}` : "";
}

/** "04:00 to 05:00 GMT" for the hour starting at `start`. */
export function hourSpan(start: string): string {
  return `${ukClock(start)} to ${ukTime(new Date(Date.parse(start) + 3_600_000).toISOString())}`;
}

/** Where the forecast for one hour went after the gate, from the last run that covers it. */
export function rollNote(d: Decision, lines: RunLine[], i: number): string {
  const last = lines.findLast((l) => l.after && l.values[i] !== undefined);
  const hour = d.hours[i];
  if (!last) return "";
  const value = last.values[i] as number;
  const diff = value - hour.forecast_mw;
  const moved = Math.round(diff) === 0 ? "had not moved from the run you had" : `had moved to ${mw(value)}, ${mw(Math.abs(diff))} ${diff < 0 ? "below" : "above"} the run you had`;
  return `By ${ukDay(last.time)}, ${ukClock(last.time)}, the forecast for ${ukClock(hour.start_time)} ${moved}. Metered wind came in at ${mw(hour.actual_mw)}.`;
}
