import { useRef } from "react";

import type { DayMiss } from "../api";
import { mw, ukShortDay } from "../format";
import { useCentered } from "../hooks";

interface Props {
  worst: DayMiss[];
  day: string;
  smooth: boolean;
  onPick: (day: string) => void;
}

export function WorstDays({ worst, day, smooth, onPick }: Props) {
  const row = useRef<HTMLDivElement>(null);
  useCentered(row, '[aria-pressed="true"]', day, smooth);
  return (
    <div className="field">
      <p className="field-label" id="worst-label">
        Worst days at this gate <span className="hint">largest mean gap first</span>
      </p>
      <div className="worst" role="group" aria-labelledby="worst-label" ref={row}>
        {worst.map((w) => (
          <button key={w.day} type="button" aria-pressed={w.day === day} onClick={() => onPick(w.day)}>
            <b>{ukShortDay(w.day)}</b>
            <span>{mw(w.bias_mw, true)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
