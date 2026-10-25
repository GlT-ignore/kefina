import type { Decision, Gate, GateId } from "../api";
import { ukClock } from "../format";
import { runLeadMinutes } from "../lib/decision";
import { gateName } from "../lib/meta";

interface Props {
  gates: Gate[];
  gate: GateId;
  decision: Decision;
  onSelect: (gate: GateId) => void;
}

export function GatePresets({ gates, gate, decision, onSelect }: Props) {
  // The N2EX gate sits only minutes after a run goes out, so say what that assumes.
  const tight = decision.gate === "n2ex_0950" && gate === decision.gate;
  const run = ukClock(decision.runs_used[0].publish_time);
  const closes = gates.find((g) => g.id === decision.gate)?.closes_uk;
  return (
    <div className="field">
      <p className="field-label" id="gate-label">
        Auction gate <span className="hint">GMT, the day before delivery</span>
      </p>
      <div className="gates" role="group" aria-labelledby="gate-label">
        {gates.map((g) => (
          <button key={g.id} type="button" aria-pressed={g.id === gate} onClick={() => onSelect(g.id)}>
            <b>{g.closes_uk}</b>
            <span>{gateName(g)}</span>
          </button>
        ))}
      </div>
      {tight && (
        <details className="how gate-how">
          <summary>About the {closes} gate</summary>
          <p className="how-body">
            The {run} run was published {runLeadMinutes(decision)} minutes before this gate. This view assumes the {run} run was in hand by {closes}, in time to bid on.
          </p>
        </details>
      )}
    </div>
  );
}
