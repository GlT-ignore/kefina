import type { CSSProperties } from "react";

import type { Decision } from "../api";
import { num, ukTime } from "../format";
import { sparkPath } from "../lib/chart";
import { type LogRow, logRows, minutesOf } from "../lib/decision";

function Run({ row }: { row: LogRow }) {
  const late = row.run.after_gate;
  const status = row.used ? "the run you had" : late ? "after the gate" : "read before the gate";
  return (
    <li className={`run${row.used ? " is-used" : ""}${late ? " is-late" : ""}`} data-t={row.minutes}>
      <div className="run-in">
        <span className="run-time">{row.time}</span>
        <span className="run-status">
          {status}
          <span className="run-delta">{row.change}</span>
        </span>
        <svg className="run-spark" viewBox="0 0 120 28" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d={sparkPath(row.run.points.map((p) => p.forecast_mw), 120, 28)} pathLength={1} />
        </svg>
        <span className="run-val">
          <span className="sr">{row.run.points.length}-hour mean </span>
          {/* One span per character, so the scene can type the value in. */}
          <span className="run-num">
            {[...num(row.mean)].map((c, i) => (
              <span className="ch" key={i}>
                {c}
              </span>
            ))}
          </span>{" "}
          <small>MW</small>
        </span>
      </div>
    </li>
  );
}

export function BulletinLog({ decision }: { decision: Decision }) {
  const { before, after } = logRows(decision);
  return (
    <ol className="log" aria-label="Forecast runs published the day before delivery">
      {before.map((row) => (
        <Run key={row.run.publish_time} row={row} />
      ))}
      <li className="gate-row" data-t={minutesOf(decision.cutoff)}>
        <span className="gate-rule" aria-hidden="true" />
        <span className="gate-text">{ukTime(decision.cutoff)}, gate closes</span>
      </li>
      <li className="behind" style={{ "--n": after.length } as CSSProperties}>
        <ol aria-label="Runs published after the gate">
          {after.map((row) => (
            <Run key={row.run.publish_time} row={row} />
          ))}
        </ol>
        <span className="shutter" aria-hidden="true" />
      </li>
    </ol>
  );
}
