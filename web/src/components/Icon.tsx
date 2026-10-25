const PATHS = {
  prev: "M15 5l-7 7 7 7",
  next: "M9 5l7 7-7 7",
  down: "M12 5v14M6 13l6 6 6-6",
};

export function Icon({ name }: { name: keyof typeof PATHS }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Brand() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M5 21h22" className="b-rule" />
      <path d="M9 18v3M13 19v2M19 19v2M23 18v3" className="b-rule" />
      <path d="M16 8v15" className="b-needle" />
    </svg>
  );
}
