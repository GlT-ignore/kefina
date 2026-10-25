import type { Metrics } from "../api";
import { mw, num } from "../format";
import { How } from "./How";

interface Props {
  headline: Metrics;
  gateTime: string;
  period: string;
}

export function Ledger({ headline: a, gateTime, period }: Props) {
  const rule = `The last run published before the ${gateTime} gate, the day before delivery.`;
  const rows = [
    ["Mean absolute error", num(a.mae_mw ?? 0), "MW", `${Math.round(a.nmae_pct ?? 0)}% of mean output`, `Mean of |forecast minus metered wind|. Share of output: divided by mean metered wind, ${mw(a.mean_actual_mw ?? 0)}.`],
    ["Root mean square error", num(a.rmse_mw ?? 0), "MW", "weights the big misses", "Square root of the mean of (forecast minus metered wind) squared."],
    ["Bias", num(a.bias_mw ?? 0, true), "MW", `forecast ${(a.bias_mw ?? 0) >= 0 ? "above" : "below"} metered wind on average`, "Mean of (forecast minus metered wind). Positive means the forecast ran above metered wind."],
    [
      "Forecast above metered wind",
      String(Math.round((a.share_over ?? 0) * 100)),
      "% of hours",
      `1 hour in 10 was over ${mw(a.p90_mw ?? 0)}`,
      "Count of hours where forecast is greater than metered wind, divided by hours counted. The 1 in 10 figure is the 90th percentile of (forecast minus metered wind).",
    ],
  ];
  return (
    <dl className="ledger">
      {rows.map(([dt, value, unit, aside, formula]) => (
        <div className="led" key={dt}>
          <dt>{dt}</dt>
          <dd>
            <span className="led-num" data-count={value}>
              {value}
            </span>
            <span className="led-unit">{unit}</span>
            <span className="led-aside">{aside}</span>
          </dd>
          <dd className="led-how">
            <How about={dt.toLowerCase()} rule={rule} period={period} hours={num(a.n)} formula={formula} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
