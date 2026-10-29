import type { CSSProperties } from "react";

import type { Accuracy } from "../api";
import { monthName, mw, num, pct } from "../format";
import { bucketLabel } from "../lib/accuracy";
import { How } from "./How";

interface Props {
  accuracy: Accuracy;
  gateTime: string;
  /** "2 Jan to 1 Feb 2026" */
  delivery: string;
  /** "1 to 31 Jan" */
  decisions: string;
  month: string;
}

const meter = (v: number) => ({ "--v": v.toFixed(3) }) as CSSProperties;

/** January's accuracy at one gate, set out as a printed statement. */
export function Statement({ accuracy: acc, gateTime, delivery, decisions, month }: Props) {
  const a = acc.headline;
  const n = num(a.n);
  const rule = `For each delivery hour, the forecast from the run you had at the ${gateTime} gate.`;
  const period = `Delivery ${delivery}, decisions made ${decisions}.`;
  const rows: [string, string, string][] = [
    ["Root mean square error", mw(a.rmse_mw ?? 0), "The square root of the mean of squared forecast minus metered. Large misses weigh more than in the mean absolute error."],
    ["Bias, forecast minus metered", mw(a.bias_mw ?? 0, true), "The mean of forecast minus metered wind, signs kept. Positive means the forecast ran above metered wind on average."],
    ["Hours with the forecast above metered wind", pct(a.share_over ?? 0), "The share of hours where forecast minus metered was above zero."],
    ["Middle 80% of hourly misses", `${num(a.p10_mw ?? 0, true)} to ${mw(a.p90_mw ?? 0, true)}`, "The 10th and 90th percentiles of forecast minus metered. One hour in ten sat outside each end."],
    ["Median hourly miss", mw(a.p50_mw ?? 0, true), "The 50th percentile of forecast minus metered."],
    ["Largest hourly overshoot", mw(a.worst_over_mw ?? 0), "The largest single value of forecast minus metered."],
  ];
  // The hours past 48 come from runs older than the two days before delivery, so they are left out here.
  const lead = acc.by_lead_time.filter((b) => !b.bucket.endsWith("+"));
  const leadTop = Math.max(...lead.map((b) => b.mae_mw ?? 0));
  const months = acc.monthly;
  const monthTop = Math.max(...months.map((m) => Math.abs(m.bias_mw)));
  const largest = months.reduce((best, m) => (Math.abs(m.bias_mw) > Math.abs(best.bias_mw) ? m : best));
  const allAbove = months.every((m) => m.bias_mw > 0);
  const span = `${monthName(months[0].month)} to ${monthName(months[months.length - 1].month)}`;
  const scored = month.split(" ")[0];

  return (
    <section id="statement" className="statement" aria-labelledby="statement-title">
      <div className="sec-head">
        <h2 id="statement-title" className="sec-title" data-split>
          {scored}'s statement
        </h2>
        <p className="lead">
          Every {scored} delivery hour at the {gateTime} gate: the forecast you had, set against metered wind. These are the numbers to size the error you plan for.
        </p>
      </div>

      <div className="sheet sheet-main">
        <div className="total">
          <p className="total-fig">{mw(a.mae_mw ?? 0)}</p>
          <p className="total-label">Mean absolute error at the {gateTime} gate</p>
          <p className="total-note">
            That is {Math.round(a.nmae_pct ?? 0)}% of mean metered output ({mw(a.mean_actual_mw ?? 0)}), across {n} hours, {delivery}.
          </p>
          <How about="mean absolute error" rule={rule} period={period} hours={n} formula="The mean of the absolute value of forecast minus metered wind." />
        </div>
        <table className="lines">
          <caption>
            Statement for the {gateTime} gate, delivery {delivery}
          </caption>
          <tbody>
            {rows.map(([label, value, formula]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{value}</td>
                <td>
                  <How about={label.toLowerCase()} label="How" rule={rule} period={period} hours={n} formula={formula} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sheet sheet-split">
        <div className="part">
          <h3>Error grows with lead time</h3>
          <table className="bars" data-ui>
            <caption>Mean absolute error by hours ahead, every run in the two days before delivery, MW</caption>
            <tbody>
              {lead.map((b) => (
                <tr key={b.bucket}>
                  <th scope="row">{bucketLabel(b.bucket)} ahead</th>
                  <td>{num(b.mae_mw ?? 0)}</td>
                  <td className="bar-cell">
                    <span className="meter" style={meter((b.mae_mw ?? 0) / leadTop)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="part">
          <h3>Bias by month at {gateTime}</h3>
          <table className="bars" data-ui>
            <caption>Forecast minus metered, mean over each calendar month, MW</caption>
            <tbody>
              {months.map((m) => (
                <tr key={m.month}>
                  <th scope="row">
                    {monthName(m.month)} {m.month.slice(0, 4)}
                  </th>
                  <td>{num(m.bias_mw, true)}</td>
                  <td className="bar-cell">
                    <span className="meter" style={meter(Math.abs(m.bias_mw) / monthTop)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="part-note">
            {allAbove && `The forecast ran above metered wind in every month from ${span}. `}
            {monthName(largest.month)}'s bias is the largest of the {months.length} months. {scored} here is the whole calendar month, so it differs a little from the bias above, which counts delivery days {delivery}.
          </p>
        </div>
      </div>
    </section>
  );
}
