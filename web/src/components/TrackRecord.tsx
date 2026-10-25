import { useRef } from "react";

import type { Meta, Rule, TrackRecord as Track } from "../api";
import { num, pct, ukShortDay } from "../format";
import { linear } from "../lib/chart";
import { calibrationLabels, gateTime } from "../lib/meta";
import { useSize } from "../hooks";
import { How } from "./How";

interface Props {
  record: Track;
  meta: Meta;
  gate: string;
  delivery: string;
  month: string;
}

function rules(meta: Meta): { [K in Rule["rule"]]: [string, string, string] } {
  const b = meta.bias_window_days;
  const m = meta.margin_window_days;
  return {
    raw: ["Raw forecast", "The run you had, as published.", "Planned wind = forecast."],
    bias: [`Minus the last ${b} days' bias`, `The run you had, minus its mean gap over the previous ${b} days.`, `Planned wind = forecast minus mean(forecast minus metered) over the previous ${b} days.`],
    margin: [`Minus a P90 margin from the last ${m} days`, `The run you had, minus the 90th percentile of its gap over the previous ${m} days.`, `Planned wind = forecast minus P90(forecast minus metered) over the previous ${m} days.`],
  };
}

export function TrackRecord({ record, meta, gate, delivery, month }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const w = Math.max(280, useSize(box, { w: 900, h: 0 }).w);
  const half = w / 2;
  const room = w < 640 ? 74 : 150;
  const sx = linear(0, Math.max(...record.january.flatMap((r) => [r.gwh_short, r.gwh_over])), 0, half - room);
  const text = rules(meta);
  const c = record.calibration;
  const cal = calibrationLabels(c);
  const at = gateTime(meta, record.gate);
  const calFirst = ukShortDay(c.calibration_days[0]);
  const calLast = `${ukShortDay(c.calibration_days[c.calibration_days.length - 1])} ${c.calibration_days[c.calibration_days.length - 1].slice(0, 4)}`;
  return (
    <section className="record" id="record" aria-labelledby="record-title">
      <div className="wrap">
        <p className="eyebrow">Track record</p>
        <h2 id="record-title" className="display" data-split>
          Three ways to plan around it, <em>tested on {month}.</em>
        </h2>
        <p className="lede">
          Each rule starts from the run you had at the {at} gate. Short means the planned wind was above metered wind; not counted on means metered wind came in above the plan. Window lengths were chosen on {cal.span}, then frozen; {cal.longest} days was the longest window we tried. The buyer decides which trade-off fits.
        </p>
        {gate !== record.gate && <p className="gate-note">The track record is computed for the {at} gate only.</p>}
        <div className="rules" ref={box}>
          {record.january.map((r) => {
            const [name, desc, formula] = text[r.rule];
            const s = sx(r.gwh_short);
            const o = sx(r.gwh_over);
            return (
              <article className={`rule rule-${r.rule}`} key={r.rule}>
                <header className="rule-head">
                  <h3>{name}</h3>
                  <p>
                    {desc}
                    {r.coverage !== undefined && ` Covers about ${Math.round(r.coverage * 10) * 10}% of hours.`}
                  </p>
                </header>
                <p className="rule-hours">
                  <span className="rule-num" data-count={num(r.hours_short)}>
                    {num(r.hours_short)}
                  </span>{" "}
                  hours short of {num(r.n)}
                </p>
                <svg className="diverge" viewBox={`0 0 ${w} 58`} width="100%" role="img" aria-label={`${name}: ${num(r.gwh_short)} GWh short, ${num(r.gwh_over)} GWh not counted on.`} focusable="false">
                  <line className="axis-mid" x1={half} x2={half} y1={0} y2={58} />
                  <rect className="short" x={(half - s).toFixed(1)} y={8} width={s.toFixed(1)} height={22} rx={2} />
                  <rect className="over" x={half} y={8} width={o.toFixed(1)} height={22} rx={2} />
                  <text className="dv-val" x={(half - s - 8).toFixed(1)} y={24} textAnchor="end">
                    {num(r.gwh_short)}
                  </text>
                  <text className="dv-val" x={(half + o + 8).toFixed(1)} y={24}>
                    {num(r.gwh_over)}
                  </text>
                  <text className="dv-cap" x={half - 8} y={50} textAnchor="end">
                    GWh short
                  </text>
                  <text className="dv-cap" x={half + 8} y={50}>
                    GWh not counted on
                  </text>
                </svg>
                <How
                  about={name}
                  rule={desc}
                  period={`Delivery days ${delivery}, ${at} gate. Windows chosen on ${cal.span}, then frozen.`}
                  hours={num(r.n)}
                  formula={`${formula} Short = sum over hours of max(0, planned minus metered), in GWh. Not counted on = sum of max(0, metered minus planned).`}
                />
              </article>
            );
          })}
        </div>
        <details className="how calib">
          <summary>How the windows were chosen</summary>
          <div className="how-body">
            <p>
              Windows were picked on {num(c.hours)} hours from {calFirst} to {calLast}, then frozen before {month} was scored.
            </p>
            <div className="table-wrap" tabIndex={0} role="region" aria-label="Window lengths tried">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Window</th>
                    <th scope="col">Margin covered metered wind</th>
                    <th scope="col">Bias rule, total mismatch</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(c.margin_coverage).map((k) => {
                    const days = Number(k);
                    const chosen = days === c.margin_days || days === c.bias_days;
                    return (
                      <tr key={k} className={chosen ? "is-chosen" : undefined}>
                        <th scope="row">
                          {k} days{days === c.margin_days ? ", margin" : ""}
                          {days === c.bias_days ? ", bias" : ""}
                        </th>
                        <td>{pct(c.margin_coverage[k])}</td>
                        <td>{num(c.bias_total_mismatch_gwh[k])} GWh</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p>
              The margin window with the highest coverage ({c.margin_days} days) and the bias window with the lowest total mismatch ({c.bias_days} days) were kept. {cal.longest} days was the longest window we tried.
            </p>
          </div>
        </details>
      </div>
    </section>
  );
}
