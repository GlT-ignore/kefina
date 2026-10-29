import type { CSSProperties } from "react";

import type { Meta, Rule, TrackRecord as Track } from "../api";
import { num, pct } from "../format";
import { calibrationLabels, gateTime } from "../lib/meta";
import { How } from "./How";

interface Props {
  record: Track;
  meta: Meta;
  delivery: string;
  month: string;
}

function rules(meta: Meta): { [K in Rule["rule"]]: [string, string, string] } {
  const b = meta.bias_window_days;
  const m = meta.margin_window_days;
  return {
    raw: ["Raw forecast", "Plan on the run you had, as published.", "Planned wind = forecast."],
    bias: [`Minus the last ${b} days' bias`, `Subtract the mean miss of the ${b} days before the decision.`, `Planned wind = forecast minus mean(forecast minus metered) over the previous ${b} days.`],
    margin: [`Minus a ${m}-day margin`, `Subtract the P90 miss of the ${m} days before the decision.`, `Planned wind = forecast minus P90(forecast minus metered) over the previous ${m} days.`],
  };
}

const bar = (v: number) => ({ "--v": v.toFixed(3) }) as CSSProperties;

export function TrackRecord({ record, meta, delivery, month }: Props) {
  const text = rules(meta);
  const c = record.calibration;
  const cal = calibrationLabels(c);
  const at = gateTime(meta, record.gate);
  const scored = month.split(" ")[0];
  const top = Math.max(...record.january.map((r) => r.gwh_short + r.gwh_over));
  const windows = Object.keys(c.margin_coverage);
  return (
    <section id="record" className="record" aria-labelledby="record-title">
      <div className="sec-head">
        <h2 id="record-title" className="sec-title" data-split>
          Three ways to plan around it
        </h2>
        <p className="lead">
          Three rules for turning the forecast into a plan, each tested on every {scored} hour at the {at} gate. Short means metered wind came in below the plan. Not counted on means metered wind came in above it. The buyer decides which trade-off fits.
        </p>
      </div>
      <div className="stub-row" data-ui>
        {record.january.map((r) => {
          const [name, desc, formula] = text[r.rule];
          return (
            <article className="stub-card" key={r.rule}>
              <h3>{name}</h3>
              <p className="sc-rule">
                {desc}
                {r.coverage !== undefined && ` Covers about ${Math.round(r.coverage * 10) * 10}% of hours.`}
              </p>
              <p className="sc-fig">
                {num(r.gwh_short)} <span>GWh short</span>
              </p>
              <div className="sc-bar" aria-hidden="true">
                <span className="short" style={bar(r.gwh_short / top)} />
                <span className="over" style={bar(r.gwh_over / top)} />
              </div>
              <dl>
                <div>
                  <dt>Not counted on</dt>
                  <dd>{num(r.gwh_over)} GWh</dd>
                </div>
                <div>
                  <dt>Hours short</dt>
                  <dd>
                    {num(r.hours_short)} of {num(r.n)}
                  </dd>
                </div>
              </dl>
              <How
                about={name}
                rule={desc}
                period={`Delivery ${delivery}, ${at} gate. Windows chosen on ${cal.span}, then frozen.`}
                hours={num(r.n)}
                formula={`${formula} Short = sum over hours of max(0, planned minus metered), in GWh. Not counted on = sum of max(0, metered minus planned).`}
              />
            </article>
          );
        })}
      </div>
      <div className="record-foot">
        <ul className="key key-dark">
          <li>
            <span className="sw sw-short" />
            GWh short
          </li>
          <li>
            <span className="sw sw-over" />
            GWh not counted on
          </li>
        </ul>
        <p>
          Windows chosen on {cal.span} ({num(c.hours)} hours), then frozen before {scored}: {c.margin_days} days for the margin, the one with the highest coverage, and {c.bias_days} for the bias, the one with the lowest total mismatch. {cal.longest} days was the longest window tried. The track record covers the {at} gate only.
        </p>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Window lengths tried">
          <table className="calib">
            <caption>How each window did on {cal.span}</caption>
            <thead>
              <tr>
                <th scope="col">Window</th>
                {windows.map((k) => (
                  <th scope="col" key={k}>
                    {k} days
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Margin covered</th>
                {windows.map((k) => (
                  <td key={k}>{pct(c.margin_coverage[k])}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">Bias rule, total mismatch, GWh</th>
                {windows.map((k) => (
                  <td key={k}>{num(c.bias_total_mismatch_gwh[k])}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
