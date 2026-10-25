import { useRef } from "react";

import type { Decision } from "../api";
import { num, ukClock, ukDay, ukShortDay } from "../format";
import { linear } from "../lib/chart";
import { hourDrift } from "../lib/decision";
import { useSize } from "../hooks";
import { Icon } from "./Icon";

interface Props {
  decision: Decision;
  hour: number;
  onHour: (i: number) => void;
}

export function DriftLadder({ decision: d, hour, onHour }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const size = useSize(box, { w: 900, h: 0 });
  const { hour: p, rows, firstLate, preRange, usedValue } = hourDrift(d, hour);
  const values = [...rows.flatMap((r) => (r.value === undefined ? [] : [r.value])), p.actual_mw];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max(400, (hi - lo) * 0.08);
  const w = Math.max(300, size.w);
  const compact = w < 600;
  const rowH = compact ? 34 : 32;
  const m = { t: 34, r: compact ? 62 : 84, b: 30, l: compact ? 98 : 168 };
  const h = m.t + (rows.length + (firstLate >= 0 ? 1 : 0)) * rowH + m.b;
  const sx = linear(lo - pad, hi + pad, m.l, w - m.r);
  const rowY = (i: number) => m.t + (i + (firstLate >= 0 && i >= firstLate ? 1 : 0)) * rowH + rowH / 2;
  const ticks = [lo - pad, (lo + hi) / 2, hi + pad].map((v) => Math.round(v / 100) * 100);
  const indexed = rows.map((r, i) => ({ ...r, i })).filter((r) => r.value !== undefined);
  const poly = (list: typeof indexed) => list.map((r) => `${sx(r.value as number).toFixed(1)},${rowY(r.i).toFixed(1)}`).join(" ");
  const before = indexed.filter((r) => !r.run.after_gate);
  const after = indexed.filter((r) => r.run.after_gate);
  const bridge = before.length && after.length ? [before[before.length - 1], ...after] : after;
  const usedIdx = rows.findIndex((r) => r.used);
  const ax = sx(p.actual_mw);
  const at = ukClock(p.start_time);
  const run = ukClock(d.runs_used[0].publish_time);
  const label = (iso: string) => (compact ? `${ukShortDay(iso)} ${ukClock(iso)}` : `${ukDay(iso)}, ${ukClock(iso)}`);
  const gateY = rowY(firstLate) - rowH;

  return (
    <section className="drift" id="drift" aria-labelledby="drift-title">
      <div className="wrap">
        <p className="eyebrow">Forecast drift</p>
        <h2 id="drift-title" className="display" data-split>
          Every run, <em>one hour at a time.</em>
        </h2>
        <div className="drift-bar">
          <button className="step" type="button" aria-label="Previous hour" disabled={hour <= 0} onClick={() => onHour(hour - 1)}>
            <Icon name="prev" />
          </button>
          <p className="drift-hour" aria-live="polite">
            {at} GMT, {ukDay(d.day)}
          </p>
          <button className="step" type="button" aria-label="Next hour" disabled={hour >= d.hours.length - 1} onClick={() => onHour(hour + 1)}>
            <Icon name="next" />
          </button>
        </div>
        <div className="drift-body" ref={box}>
          <p className="drift-sum">
            {preRange && (
              <>
                Runs read before the gate put {at} between <b>{num(preRange[0])}</b> and <b>{num(preRange[1])} MW</b>.{" "}
              </>
            )}
            {usedValue !== undefined && (
              <>
                You had <b>{num(usedValue)} MW</b> from the {run} run.{" "}
              </>
            )}
            Metered wind was <b>{num(p.actual_mw)} MW</b>.
          </p>
          <svg
            className="ladder"
            viewBox={`0 0 ${w} ${h}`}
            width="100%"
            role="img"
            aria-label={`Every run's forecast for ${at} GMT on ${ukDay(d.day)}, in publish order. The table below lists the values.`}
            focusable="false"
          >
            <g className="grid">
              {ticks.map((v, i) => (
                <line key={i} x1={sx(v)} x2={sx(v)} y1={m.t - 6} y2={h - m.b + 4} />
              ))}
            </g>
            <g className="axis x-axis">
              {ticks.map((v, i) => (
                <text key={i} x={sx(v)} y={h - 8}>
                  {num(v)}
                </text>
              ))}
            </g>
            <line className="actual-line" x1={ax} x2={ax} y1={m.t - 12} y2={h - m.b + 4} />
            <text className="actual-label" x={ax} y={m.t - 18} textAnchor={ax > w - 140 ? "end" : ax < m.l + 100 ? "start" : "middle"}>
              metered {num(p.actual_mw)}
            </text>
            {firstLate >= 0 && (
              <g className="gate-band">
                <line x1={0} x2={w} y1={gateY} y2={gateY} />
                <text x={0} y={gateY + rowH / 2 + 4}>
                  {ukClock(d.cutoff)} gate closed. After the gate:
                </text>
              </g>
            )}
            <polyline className="drift-path" points={poly(before)} />
            <polyline className="drift-path is-late" points={poly(bridge)} />
            {rows.map((r, i) => {
              const cls = r.used ? "is-used" : r.run.after_gate ? "is-late" : "";
              const yy = rowY(i);
              return (
                <g key={r.run.publish_time} className={`drow ${cls}`}>
                  <text className="drow-label" x={0} y={yy + 4}>
                    {label(r.run.publish_time)}
                  </text>
                  <line className="drow-track" x1={m.l} x2={w - m.r} y1={yy} y2={yy} />
                  {r.value === undefined ? (
                    <text className="drow-none" x={m.l} y={yy + 4}>
                      no value for this hour yet
                    </text>
                  ) : (
                    <circle className="drow-dot" cx={sx(r.value)} cy={yy} r={r.used ? 6.5 : 4.5} />
                  )}
                  <text className="drow-val" x={w} y={yy + 4} textAnchor="end">
                    {r.value === undefined ? "" : num(r.value)}
                  </text>
                </g>
              );
            })}
            {usedValue !== undefined && (
              <text className="used-label" x={sx(usedValue) + 12} y={rowY(usedIdx) - 9}>
                you had
              </text>
            )}
          </svg>
          <details className="table-view">
            <summary>All runs for this hour, as a table</summary>
            <div className="table-wrap" tabIndex={0} role="region" aria-label="All runs for this hour">
              <table>
                <caption>
                  Forecast for {at} GMT, {ukDay(d.day)}, MW. Metered: {num(p.actual_mw)}.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Published</th>
                    <th scope="col">Forecast</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.run.publish_time}>
                      <th scope="row">
                        {ukDay(r.run.publish_time)}, {ukClock(r.run.publish_time)}
                      </th>
                      <td>{r.value === undefined ? "no value" : num(r.value)}</td>
                      <td>{r.used ? "the run you had" : r.run.after_gate ? "after the gate" : "before the gate"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}
