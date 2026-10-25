import { type CSSProperties, type KeyboardEvent, useRef } from "react";

import type { DayMiss } from "../api";
import { mw, ukDay, ukShortDay } from "../format";
import { useCentered } from "../hooks";
import { Icon } from "./Icon";

interface Props {
  days: string[];
  day: string;
  daily: DayMiss[];
  worst: string[];
  span: string;
  smooth: boolean;
  onSelect: (day: string) => void;
}

const KEYS: Record<string, number> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1, Home: -Infinity, End: Infinity };

export function DayStrip({ days, day, daily, worst, span, smooth, onSelect }: Props) {
  const strip = useRef<HTMLDivElement>(null);
  const i = days.indexOf(day);
  const miss = new Map(daily.map((d) => [d.day, d.mae_mw]));
  const top = Math.max(...daily.map((d) => d.mae_mw));

  const go = (next: number) => {
    const target = days[Math.max(0, Math.min(days.length - 1, next))];
    if (target !== day) onSelect(target);
    return target;
  };

  const onKey = (e: KeyboardEvent) => {
    if (!(e.key in KEYS)) return;
    e.preventDefault();
    const target = go(i + KEYS[e.key]);
    strip.current?.querySelector<HTMLElement>(`[data-day="${target}"]`)?.focus({ preventScroll: true });
  };

  useCentered(strip, '[aria-checked="true"]', day, smooth);

  return (
    <div className="field strip-field">
      <div className="strip-head">
        <p className="field-label" id="day-label">
          Delivery day <span className="hint">{span}</span>
        </p>
        <div className="strip-steps">
          <button className="step" type="button" aria-label="Previous day" disabled={i <= 0} onClick={() => go(i - 1)}>
            <Icon name="prev" />
          </button>
          <button className="step" type="button" aria-label="Next day" disabled={i >= days.length - 1} onClick={() => go(i + 1)}>
            <Icon name="next" />
          </button>
        </div>
      </div>
      <div className="strip" role="radiogroup" aria-labelledby="day-label" ref={strip} onKeyDown={onKey}>
        {days.map((d) => {
          const on = d === day;
          const date = Number(d.slice(8));
          const m = miss.get(d);
          const isWorst = worst.includes(d);
          const label = `${ukDay(d)}${m === undefined ? "" : `, mean absolute gap ${mw(m)}`}${isWorst ? `, one of the ${worst.length} worst days` : ""}`;
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={label}
              tabIndex={on ? 0 : -1}
              data-day={d}
              className={isWorst ? "is-worst" : undefined}
              onClick={() => onSelect(d)}
            >
              <span className="dw">{d === days[0] || date === 1 ? ukShortDay(d).split(" ")[1] : ukDay(d).slice(0, 2)}</span>
              <span className="dd">{date}</span>
              <span className="miss" style={{ "--h": m === undefined ? 0 : (m / top).toFixed(3) } as CSSProperties} />
            </button>
          );
        })}
      </div>
      <p className="strip-key">
        <span>
          <i className="key-bar" aria-hidden="true" />
          Mean absolute gap
        </span>
        <span>
          <i className="key-dot" aria-hidden="true" />
          The {worst.length} worst days
        </span>
      </p>
    </div>
  );
}
