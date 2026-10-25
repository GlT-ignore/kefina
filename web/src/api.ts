import { useEffect, useState } from "react";

// Mirrors backend/models.py. Optional fields are omitted by the API, never null.

export type GateId = "epex_0920" | "n2ex_0950" | "epex_1530";

export interface Gate {
  id: GateId;
  label: string;
  closes_uk: string;
}

export interface Meta {
  gates: Gate[];
  default_gate: GateId;
  delivery_first: string;
  delivery_last: string;
  margin_window_days: number;
  bias_window_days: number;
  snapshot_pulled_at: string;
  attribution: string;
}

export interface Hour {
  start_time: string;
  publish_time: string;
  horizon_h: number;
  forecast_mw: number;
  actual_mw: number;
  error_mw: number;
  margin_mw?: number;
  bias_adj_mw?: number;
}

export interface DriftRun {
  publish_time: string;
  after_gate: boolean;
  points: { start_time: string; forecast_mw: number }[];
}

export interface Decision {
  day: string;
  gate: GateId;
  cutoff: string;
  runs_used: { publish_time: string; hours: number }[];
  hours: Hour[];
  drift: DriftRun[];
}

export interface Metrics {
  n: number;
  mae_mw?: number;
  rmse_mw?: number;
  bias_mw?: number;
  mean_actual_mw?: number;
  nmae_pct?: number;
  share_over?: number;
  p10_mw?: number;
  p50_mw?: number;
  p90_mw?: number;
  worst_over_mw?: number;
}

export interface DayMiss {
  day: string;
  mae_mw: number;
  bias_mw: number;
}

export interface Accuracy {
  gate: GateId;
  headline: Metrics;
  by_lead_time: (Metrics & { bucket: string })[];
  monthly: { month: string; n: number; bias_mw: number; mae_mw: number }[];
  daily: DayMiss[];
  worst_days: DayMiss[];
  coverage_by_hour: { hour: number; n: number; bias_mw: number; margin_coverage: number }[];
}

export interface Rule {
  rule: "raw" | "bias" | "margin";
  n: number;
  gwh_short: number;
  gwh_over: number;
  hours_short: number;
  coverage?: number;
}

export interface TrackRecord {
  gate: GateId;
  january: Rule[];
  calibration: {
    gate: GateId;
    calibration_days: string[];
    hours: number;
    margin_coverage: Record<string, number>;
    bias_total_mismatch_gwh: Record<string, number>;
    margin_days: number;
    bias_days: number;
  };
}

/** The opening view, rendered into the HTML at build time (see scripts/prerender.mjs). */
export interface Initial {
  meta: Meta;
  decision: Decision;
  accuracy: Accuracy;
  trackRecord: TrackRecord;
}

export const paths = {
  meta: "/api/meta",
  decision: (day: string, gate: GateId) => `/api/decision?day=${day}&gate=${gate}`,
  accuracy: (gate: GateId) => `/api/accuracy?gate=${gate}`,
  trackRecord: "/api/track-record",
};

interface ApiState<T> {
  data?: T;
  error?: string;
  loading: boolean;
}

// Answers never change within a deploy, so one fetch per path is enough.
const cache = new Map<string, unknown>();

/** Fill the cache with the prerendered answers so hydration needs no request. */
export function seedCache(initial: Initial): void {
  cache.set(paths.meta, initial.meta);
  cache.set(paths.decision(initial.decision.day, initial.decision.gate), initial.decision);
  cache.set(paths.accuracy(initial.accuracy.gate), initial.accuracy);
  cache.set(paths.trackRecord, initial.trackRecord);
}

export function useApi<T>(path: string): ApiState<T> {
  const cached = cache.get(path) as T | undefined;
  const [shown, setShown] = useState<{ path: string; data?: T; error?: string }>({ path, data: cached });
  // Remember the last answer on screen, so the next path can keep it while it loads and switching days does not flash.
  if (cached !== undefined && shown.data !== cached) setShown({ path, data: cached });

  useEffect(() => {
    if (cache.has(path)) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        const res = await fetch(path, { signal: controller.signal });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const data = (await res.json()) as T;
        cache.set(path, data);
        setShown({ path, data });
      } catch (err) {
        if (!controller.signal.aborted) setShown((prev) => ({ path, data: prev.data, error: String(err) }));
      }
    };
    void load();
    return () => controller.abort();
  }, [path]);

  if (cached !== undefined) return { data: cached, loading: false };
  const failed = shown.path === path && shown.error !== undefined;
  return { data: shown.data, error: failed ? shown.error : undefined, loading: !failed };
}
