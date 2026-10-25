import type { GateId } from "../api";

export interface View {
  day: string;
  gate: GateId;
}

const GATES: GateId[] = ["epex_0920", "n2ex_0950", "epex_1530"];

/** The view a link asks for, keeping the fallback for anything missing or unknown. */
export function viewFromSearch(search: string, days: string[], fallback: View): View {
  const q = new URLSearchParams(search);
  const day = q.get("day") ?? "";
  const gate = q.get("gate") as GateId;
  return { day: days.includes(day) ? day : fallback.day, gate: GATES.includes(gate) ? gate : fallback.gate };
}

export function viewSearch(v: View): string {
  return `?${new URLSearchParams({ day: v.day, gate: v.gate })}`;
}

export function nextGate(gate: GateId): GateId {
  return GATES[(GATES.indexOf(gate) + 1) % GATES.length];
}
