import type { Accuracy, Decision } from "../api";
import { num, ukClock, ukDay } from "../format";
import { dayFacts, gateSentence } from "../lib/decision";
import { How } from "./How";
import { Icon } from "./Icon";

interface Props {
  decision: Decision;
  accuracy: Accuracy;
  gateTime: string;
  month: string;
  error?: string;
}

const ordinal = (n: number) => (n === 1 ? "" : `${n}${n === 2 ? "nd" : n === 3 ? "rd" : "th"} `);

export function GateSentence({ decision: d, accuracy, gateTime, month, error }: Props) {
  const f = dayFacts(d);
  const rank = accuracy.worst_days.findIndex((w) => w.day === d.day) + 1;
  const run = ukClock(f.run);
  const period = `Delivery day ${ukDay(d.day)}, ${f.n} hours`;
  const worst = d.hours[f.worstIdx];
  return (
    <div className="readout">
      <p className="readout-day">
        <span className="readout-date">{ukDay(d.day)}</span>
        {rank > 0 && <span className="tag">{`${ordinal(rank)}worst ${month} day at ${gateTime}`}</span>}
      </p>
      <p className="sentence" aria-live="polite">
        {gateSentence(d)}
      </p>
      {error && <p className="error">Could not load that day ({error}). The last loaded day is still shown.</p>}
      <dl className="figures">
        <div className="figure">
          <dt>Mean gap, forecast minus metered</dt>
          <dd>
            <span className="fig-num">{num(f.meanGap, true)}</span> MW
          </dd>
          <How about="the day's mean gap" rule={`The ${run} run, the last one published before the ${gateTime} gate.`} period={period} hours={f.n} formula="Mean of (forecast minus metered wind) over the day's hours." />
        </div>
        <div className="figure">
          <dt>Forecast above metered wind</dt>
          <dd>
            <span className="fig-num">{f.over}</span> of {f.n} hours
          </dd>
          <How about="the day's hours above metered wind" rule={`The ${run} run at the ${gateTime} gate.`} period={period} hours={f.n} formula="Count of hours where forecast is greater than metered wind." />
        </div>
        <div className="figure">
          <dt>Largest hourly gap</dt>
          <dd>
            <span className="fig-num">{num(worst.error_mw, true)}</span> MW <span className="fig-aside">at {ukClock(worst.start_time)}</span>
          </dd>
          <How about="the day's largest hourly gap" rule={`The ${run} run at the ${gateTime} gate.`} period={period} hours={f.n} formula="The hour with the largest absolute value of (forecast minus metered wind)." />
        </div>
      </dl>
      <a className="go" href="#chart">
        Read the bulletins <Icon name="down" />
      </a>
    </div>
  );
}
