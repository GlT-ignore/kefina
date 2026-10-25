import { useEffect } from "react";

import { ukDay } from "../format";
import { Icon } from "./Icon";

interface Props {
  day: string;
  gateTime: string;
  canPrev: boolean;
  canNext: boolean;
  onStep: (step: number) => void;
  onCycleGate: () => void;
}

export function Dock({ day, gateTime, canPrev, canNext, onStep, onCycleGate }: Props) {
  useEffect(() => {
    const hero = document.getElementById("gate");
    if (!hero) return;
    const root = document.documentElement;
    const observer = new IntersectionObserver(([entry]) => root.classList.toggle("past-hero", !entry.isIntersecting), { rootMargin: "-80px 0px 0px 0px" });
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  return (
    <nav className="dock" aria-label="Day and gate">
      <button type="button" aria-label="Previous day" disabled={!canPrev} onClick={() => onStep(-1)}>
        <Icon name="prev" />
      </button>
      <a className="dock-now" href="#chart">
        <span>{ukDay(day)}</span>
        <small>gate {gateTime}</small>
      </a>
      <button type="button" aria-label="Next day" disabled={!canNext} onClick={() => onStep(1)}>
        <Icon name="next" />
      </button>
      <button className="dock-gate" type="button" aria-label={`Next gate, now ${gateTime}`} onClick={onCycleGate}>
        <span>{gateTime}</span>
        <small>gate</small>
      </button>
    </nav>
  );
}
