import { type KeyboardEvent, type PointerEvent, useLayoutEffect, useRef } from "react";

import type { Decision, Hour } from "../api";
import { mw, num, ukClock, ukDay } from "../format";
import { bandPath, linear, linePath, mwAxis, nearestIndex } from "../lib/chart";
import { dayFacts } from "../lib/decision";
import { useSize } from "../hooks";

interface Props {
  decision: Decision;
  hour: number;
  margin: boolean;
  gateTime: string;
  marginDays: number;
  onHour: (i: number) => void;
  onMargin: () => void;
}

const KEYS: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, Home: -99, End: 99 };
const marginLine = (p: Hour) => p.forecast_mw - (p.margin_mw ?? 0);

export function ForecastChart({ decision: d, hour, margin, gateTime, marginDays, onHour, onMargin }: Props) {
  const plot = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number; drag: boolean }>(undefined);
  const size = useSize(plot, { w: 860, h: 420 });
  const w = Math.max(280, size.w);
  const compact = w < 560;
  // On phones the hour readout sits above the plot instead of over it, so the plot gives up that height.
  const h = Math.max(compact ? 180 : 220, size.h - (compact ? 74 : 0));
  const m = { t: compact ? 22 : 48, r: compact ? 10 : 18, b: 30, l: compact ? 46 : 60 };
  const hrs = d.hours;
  const axis = mwAxis(hrs.flatMap((p) => [p.forecast_mw, p.actual_mw, marginLine(p)]));
  const x = linear(0, hrs.length - 1, m.l, w - m.r);
  const y = linear(axis.bottom, axis.top, h - m.b, m.t);
  const line = (get: (p: Hour) => number) => hrs.map((p, i) => [x(i), y(get(p))] as const);
  const fc = line((p) => p.forecast_mw);
  const ac = line((p) => p.actual_mw);
  const every = compact ? 6 : 3;
  const f = dayFacts(d);
  const p = hrs[hour];
  const cx = x(hour);
  const run = ukClock(d.runs_used[0].publish_time);

  useLayoutEffect(() => {
    const el = tip.current;
    if (!el) return;
    el.style.left = compact ? "" : `${Math.min(Math.max(cx - el.offsetWidth / 2, 0), w - el.offsetWidth)}px`;
  }, [cx, w, compact, margin, p]);

  const hourAt = (e: PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return nearestIndex(((e.clientX - r.left) / r.width) * w, m.l, w - m.r, hrs.length);
  };
  // A finger reads an hour on a tap or a sideways drag; a vertical swipe that starts on the plot only scrolls the page.
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
    <figure className={`frame${margin ? " show-margin" : ""}`} id="chart">
      <div className="frame-slats" aria-hidden="true" />
      <figcaption className="frame-head">
        <p className="frame-title">
          {ukDay(d.day)}: the {run} run against metered wind
        </p>
        <ul className="legend" aria-label="Legend">
          <li>
            <i className="sw sw-f" />
            Forecast you had
          </li>
          <li>
            <i className="sw sw-a" />
            Metered wind
          </li>
        </ul>
        <button className="toggle" type="button" aria-pressed={margin} onClick={onMargin}>
          <span className="toggle-box" aria-hidden="true" />
          <i className="sw sw-m" aria-hidden="true" />
          forecast minus {marginDays}-day margin (backtest)
        </button>
      </figcaption>
      <div
        className={`plot${compact ? " is-compact" : ""}`}
        ref={plot}
        role="slider"
        tabIndex={0}
        aria-label="Delivery hour"
        aria-valuemin={0}
        aria-valuemax={hrs.length - 1}
        aria-valuenow={hour}
        aria-valuetext={`${ukClock(p.start_time)} GMT: forecast ${mw(p.forecast_mw)}, metered ${mw(p.actual_mw)}, gap ${mw(p.error_mw, true)}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => (touch.current = undefined)}
        onKeyDown={onKey}
      >
        <svg
          className="chart"
          viewBox={`0 0 ${w} ${h}`}
          width="100%"
          role="img"
          aria-label={`Forecast you had and metered wind, hourly, ${ukDay(d.day)}. Forecast above metered wind in ${f.over} of ${f.n} hours, mean gap ${mw(f.meanGap, true)}.`}
          focusable="false"
        >
          <defs>
            <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <path d="M0 0v7" className="hatch-line" />
            </pattern>
          </defs>
          <g className="grid">
            {axis.ticks.map((v) => (
              <line key={v} x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} className={v === 0 ? "zero" : undefined} />
            ))}
          </g>
          <g className="axis y-axis">
            {axis.ticks.map((v) => (
              <text key={v} x={m.l - 10} y={y(v) + 4}>
                {num(v)}
              </text>
            ))}
            {/* The unit sits under the top tick, clear of the hour readout that rides along the top. */}
            <text className="unit" x={m.l - 10} y={y(axis.top) + 18}>
              MW
            </text>
          </g>
          <g className="axis x-axis">
            {hrs.flatMap((q, i) =>
              i % every
                ? []
                : [
                    <text key={q.start_time} x={x(i)} y={h - 8}>
                      {ukClock(q.start_time)}
                    </text>,
                  ],
            )}
          </g>
          <path className="gap" d={bandPath(fc, ac)} />
          <path className="ln ln-a" d={linePath(ac)} pathLength={1} />
          <path className="ln ln-m" d={linePath(line(marginLine))} />
          <path className="ln ln-f" d={linePath(fc)} pathLength={1} />
          <g className="cross">
            <line className="cross-line" x1={cx} x2={cx} y1={m.t} y2={h - m.b} />
            <circle className="dot dot-a" r={5.5} cx={cx} cy={y(p.actual_mw)} />
            <circle className="dot dot-m" r={4.5} cx={cx} cy={y(marginLine(p))} />
            <circle className="dot dot-f" r={5.5} cx={cx} cy={y(p.forecast_mw)} />
          </g>
        </svg>
        <div className="tip" ref={tip} aria-hidden="true">
          <b>{ukClock(p.start_time)} GMT</b>
          <span>
            <i className="sw sw-f" />
            forecast {num(p.forecast_mw)}
          </span>
          <span>
            <i className="sw sw-a" />
            metered {num(p.actual_mw)}
          </span>
          <span className="tip-gap">gap {mw(p.error_mw, true)}</span>
          {margin && (
            <span>
              <i className="sw sw-m" />
              margin line {num(marginLine(p))}
            </span>
          )}
        </div>
      </div>
      <p className="plot-hint">Hover, tap or use the arrow keys to read an hour. Its drift is below.</p>
      <details className="table-view">
        <summary>Hour by hour table</summary>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Hour by hour table">
          <table>
            <caption>
              {ukDay(d.day)}, {gateTime} gate, MW
            </caption>
            <thead>
              <tr>
                <th scope="col">Hour</th>
                <th scope="col">Forecast you had</th>
                <th scope="col">Metered</th>
                <th scope="col">Gap</th>
                <th scope="col">Margin line</th>
              </tr>
            </thead>
            <tbody>
              {hrs.map((q) => (
                <tr key={q.start_time}>
                  <th scope="row">{ukClock(q.start_time)}</th>
                  <td>{num(q.forecast_mw)}</td>
                  <td>{num(q.actual_mw)}</td>
                  <td>{num(q.error_mw, true)}</td>
                  <td>{num(marginLine(q))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
