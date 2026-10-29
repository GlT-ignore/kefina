import type { DayMiss } from "../api";
import { ukShortDay } from "../format";

interface Props {
  worst: DayMiss[];
  month: string;
  gateTime: string;
  day: string;
  onPick: (day: string) => void;
}

export function WorstDays({ worst, month, gateTime, day, onPick }: Props) {
  return (
    <div className="worst" role="group" aria-labelledby="worst-label">
      <span id="worst-label">
        Worst {month} days at {gateTime}:
      </span>
      <span className="worst-list">
        {worst.slice(0, 3).map((w) => (
          <button key={w.day} type="button" className="chip" aria-pressed={w.day === day} onClick={() => onPick(w.day)}>
            {ukShortDay(w.day)}
          </button>
        ))}
      </span>
    </div>
  );
}
