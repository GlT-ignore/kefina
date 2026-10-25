import type { Gate, GateId, Meta, TrackRecord } from "../api";
import { monthName, ukShortDay } from "../format";

const DAY_MS = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Every delivery day from first to last inclusive, as YYYY-MM-DD. */
export function deliveryDays(first: string, last: string): string[] {
  const days: string[] = [];
  for (let t = Date.parse(first); t <= Date.parse(last); t += DAY_MS) days.push(isoDay(t));
  return days;
}

/** "EPEX hourly auction, 09:20" -> "EPEX hourly" */
export function gateName(gate: Gate): string {
  return gate.label.replace(/ auction, \d\d:\d\d$/, "");
}

export function gateTime(meta: Meta, id: GateId): string {
  return meta.gates.find((g) => g.id === id)?.closes_uk ?? "";
}

/** Labels for the backtest period, all derived from the delivery window. */
export function periodLabels(meta: Meta) {
  const firstDecision = isoDay(Date.parse(meta.delivery_first) - DAY_MS);
  const lastDecision = isoDay(Date.parse(meta.delivery_last) - DAY_MS);
  const year = firstDecision.slice(0, 4);
  return {
    month: `${monthName(firstDecision)} ${year}`,
    delivery: `${ukShortDay(meta.delivery_first)} to ${ukShortDay(meta.delivery_last)} ${meta.delivery_last.slice(0, 4)}`,
    decisions: `${Number(firstDecision.slice(8))} to ${ukShortDay(lastDecision)}`,
  };
}

/** How the trailing windows were chosen, in words. */
export function calibrationLabels(c: TrackRecord["calibration"]) {
  const [first, last] = [c.calibration_days[0], c.calibration_days[c.calibration_days.length - 1]];
  return {
    span: `${monthName(first)} to ${monthName(last)} ${last.slice(0, 4)}`,
    longest: Math.max(...Object.keys(c.margin_coverage).map(Number)),
  };
}
