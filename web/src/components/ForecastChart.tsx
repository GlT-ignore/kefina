import { type KeyboardEvent, type PointerEvent, useRef } from "react";

import type { Decision } from "../api";
import { mw, num, ukClock, ukDay } from "../format";
import { linear, mwAxis, slotIndex, stepBands, stepPath } from "../lib/chart";
import { hourSpan, type RunLine } from "../lib/decision";
import { useScreenHeight, useSize } from "../hooks";

interface Props {
  decision: Decision;
  /** Runs published before the gate, in publish order. */
  runs: RunLine[];
  usedIdx: number;
  hour: number;
  margin: boolean;
  onHour: (i: number) => void;
}

const KEYS: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, Home: -99, End: 99 };

/** The ticket's chart: every run before the gate, the run you had in full ink, metered wind in stamp red. */
export function ForecastChart({ decision: d, runs, usedIdx, hour, margin, onHour }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number; drag: boolean }>(undefined);
  // Drawn at the size it is shown, so its text never scales.
  const w = Math.max(280, useSize(box, { w: 640, h: 0 }).w);
  // A phone held sideways gets a plot that fits its screen whole.
  const h = Math.round(Math.max(220, Math.min(380, w * 0.6, (useScreenHeight() || Infinity) - 24)));
  const m = { t: 14, r: 10, b: 30, l: w < 480 ? 44 : 56 };
  const hrs = d.hours;
  const forecast = hrs.map((p) => p.forecast_mw);
  const actual = hrs.map((p) => p.actual_mw);
  const marginLine = hrs.map((p) => p.forecast_mw - (p.margin_mw ?? 0));
  const all = [...forecast, ...actual, ...runs.flatMap((r) => r.values.filter((v) => v !== undefined)), ...(margin ? marginLine : [])];
  const axis = mwAxis(all);
  const x = linear(0, hrs.length, m.l, w - m.r);
  const y = linear(axis.bottom, axis.top, h - m.b, m.t);
  const p = hrs[hour];
  const cx = x(hour + 0.5);
  const slot = (w - m.l - m.r) / hrs.length;
  const reading = `You had ${mw(p.forecast_mw)}. Metered ${mw(p.actual_mw)}. ${
    p.error_mw === 0 ? "Forecast matched metered wind." : `Forecast ${p.error_mw > 0 ? "above" : "below"} metered wind by ${mw(Math.abs(p.error_mw))}.`
  }`;
  const text = `${hourSpan(p.start_time)}. ${reading}`;

  const hourAt = (e: PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return slotIndex(((e.clientX - r.left) / r.width) * w, m.l, w - m.r, hrs.length);
  };
  // A finger reads an hour on a tap or a sideways drag; a vertical swipe that starts on the chart only scrolls the page.
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse") onHour(hourAt(e));
    else touch.current = { x: e.clientX, y: e.clientY, drag: false };
  };
  const onMove = (e: PointerEvent) => {
    const t = touch.current;
    if (e.pointerType === "mouse") onHour(hourAt(e));
    else if (t && (t.drag || Math.abs(e.clientX - t.x) > Math.max(8, Math.abs(e.clientY - t.y)))) {
      t.drag = true;
      onHour(hourAt(e));
    }
  };
  const onUp = (e: PointerEvent) => {
    const t = touch.current;
    if (t && !t.drag && Math.hypot(e.clientX - t.x, e.clientY - t.y) < 10) onHour(hourAt(e));
    touch.current = undefined;
  };
  const onKey = (e: KeyboardEvent) => {
    if (!(e.key in KEYS)) return;
    e.preventDefault();
    onHour(Math.max(0, Math.min(hrs.length - 1, hour + KEYS[e.key])));
  };

  return (
    <div className="t-chart">
      <div
        className="chart-box"
        data-ui
        ref={box}
        role="slider"
        tabIndex={0}
        aria-label="Hour of the delivery day. Use the arrow keys to move."
        aria-valuemin={0}
        aria-valuemax={hrs.length - 1}
        aria-valuenow={hour}
        aria-valuetext={text}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => (touch.current = undefined)}
        onKeyDown={onKey}
      >
        <svg className="chart" viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={`Forecast you had against metered wind, hour by hour, ${ukDay(d.day)}. Selected hour ${ukClock(p.start_time)}.`} focusable="false">
          <g>
            {axis.ticks.map((v) => (
              <g key={v}>
                <line className={v === 0 ? "grid zero" : "grid"} x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} />
                <text className="ylab" x={m.l - 8} y={y(v) + 4} textAnchor="end">
                  {`${num(v / 1000)}k`}
                </text>
              </g>
            ))}
            {hrs.flatMap((q, i) =>
              i % (w < 480 ? 6 : 3)
                ? []
                : [
                    <text key={q.start_time} className="xlab" x={x(i)} y={h - 9}>
                      {ukClock(q.start_time)}
                    </text>,
                  ],
            )}
          </g>
          <rect className="band" x={x(hour)} y={m.t} width={slot} height={h - m.t - m.b} />
          <path className="gap" d={stepBands(forecast, actual, x, y)} />
          <g className="runs">
            {runs.map((r, i) => (
              <path key={r.time} className={i === usedIdx ? "run is-latest" : "run"} pathLength={1} d={stepPath(r.values, x, y)} />
            ))}
          </g>
          {margin && <path className="margin-line" d={stepPath(marginLine, x, y)} />}
          <path className="metered" d={stepPath(actual, x, y)} />
          <g className="hour-marks">
            {runs.flatMap((r) => {
              const v = r.values[hour];
              return v === undefined ? [] : [<line key={r.time} className="drift-tick" x1={x(hour) + 4} x2={x(hour + 1) - 4} y1={y(v)} y2={y(v)} />];
            })}
            <circle className="dot-f" cx={cx} cy={y(p.forecast_mw)} r={5} />
            <circle className="dot-m" cx={cx} cy={y(p.actual_mw)} r={5} />
          </g>
        </svg>
      </div>
      <p className="readout" aria-live="polite">
        <strong>{hourSpan(p.start_time)}.</strong> {reading}
      </p>
    </div>
  );
}
