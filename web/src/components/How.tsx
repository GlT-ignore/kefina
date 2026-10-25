import type { ReactNode } from "react";

interface Props {
  /** The figure it explains, so each disclosure has its own name for screen readers. */
  about: string;
  rule: ReactNode;
  period: ReactNode;
  hours: ReactNode;
  formula: ReactNode;
}

export function How({ about, rule, period, hours, formula }: Props) {
  return (
    <details className="how">
      <summary>
        How was this computed<span className="sr">: {about}</span>
      </summary>
      <dl className="how-body">
        <div>
          <dt>Rule</dt>
          <dd>{rule}</dd>
        </div>
        <div>
          <dt>Period</dt>
          <dd>{period}</dd>
        </div>
        <div>
          <dt>Hours counted</dt>
          <dd>{hours}</dd>
        </div>
        <div>
          <dt>Formula</dt>
          <dd>{formula}</dd>
        </div>
      </dl>
    </details>
  );
}
