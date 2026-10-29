import { type CSSProperties, type KeyboardEvent, useLayoutEffect, useRef } from "react";

import type { DayMiss } from "../api";
import { mw, num, ukDay } from "../format";
import { EASE, gsap } from "../motion";

interface Props {
  days: string[];
  day: string;
  daily: DayMiss[];
  worst: string[];
  motion: boolean;
  onSelect: (day: string) => void;
}

const KEYS: Record<string, number> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1, Home: -Infinity, End: Infinity };

/** One paper stub per delivery day, its bar the day's mean miss. On phones the stubs fall into a Monday-first month. */
export function DayStrip({ days, day, daily, worst, motion, onSelect }: Props) {
  const strip = useRef<HTMLDivElement>(null);
  const i = days.indexOf(day);
  const miss = new Map(daily.map((d) => [d.day, d.mae_mw]));
  const top = Math.max(...daily.map((d) => d.mae_mw));
  const column = ((new Date(`${days[0]}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

  // Each gate has its own misses, so the bars draw up again when the gate changes.
  useLayoutEffect(() => {
    const el = strip.current;
    if (!motion || !el) return;
    const tween = gsap.fromTo(el.querySelectorAll(".s-bar"), { scaleY: 0 }, { scaleY: 1, duration: 0.5, ease: EASE, stagger: 0.012 });
    return () => {
      tween.revert();
    };
  }, [daily, motion]);

  const onKey = (e: KeyboardEvent) => {
    if (!(e.key in KEYS)) return;
    e.preventDefault();
    const target = days[Math.max(0, Math.min(days.length - 1, i + KEYS[e.key]))];
    if (target !== day) onSelect(target);
    strip.current?.querySelector<HTMLElement>(`[data-day="${target}"]`)?.focus();
  };

  return (
    <div className="stubs" id="days" role="radiogroup" aria-label="Delivery day, with each day's mean miss at the selected gate" ref={strip} onKeyDown={onKey} style={{ "--start": column } as CSSProperties}>
      {days.map((d) => {
        const m = miss.get(d);
        const rank = worst.indexOf(d);
        const label = `${ukDay(d)}${m === undefined ? "" : `, mean miss ${mw(m)}`}${rank === 0 ? ", the worst day" : rank > 0 ? `, one of the ${worst.length} worst days` : ""}`;
        return (
          <button
            key={d}
            type="button"
            className="stub"
            role="radio"
            aria-checked={d === day}
            aria-label={label}
            tabIndex={d === day ? 0 : -1}
            data-day={d}
            style={{ "--v": m === undefined ? 0 : (m / top).toFixed(3) } as CSSProperties}
            onClick={() => onSelect(d)}
          >
            <span className="s-wd">{ukDay(d).split(" ")[0]}</span>
            <span className="s-dn">{Number(d.slice(8))}</span>
            <span className="s-track">
              <span className="s-bar" />
            </span>
            <span className="s-miss">{m === undefined ? "" : num(m)}</span>
          </button>
        );
      })}
    </div>
  );
}
