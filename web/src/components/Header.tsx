import { Brand } from "./Icon";

const LINKS = [
  ["#chart", "Chart", "Forecast vs metered"],
  ["#accuracy", "Error", "Accuracy"],
  ["#record", "Record", "Track record"],
];

export function Header() {
  return (
    <header className="head">
      <a className="brand" href="#gate" aria-label="Readback, back to the day picker">
        <Brand />
        <span>Readback</span>
      </a>
      <nav className="nav" aria-label="Sections">
        {LINKS.map(([href, short, long]) => (
          <a key={href} href={href}>
            <span className="l-short">{short}</span>
            <span className="l-long">{long}</span>
          </a>
        ))}
      </nav>
    </header>
  );
}
