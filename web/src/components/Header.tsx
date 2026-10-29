const LINKS = [
  ["#ticket", "Ticket"],
  ["#statement", "Statement"],
  ["#record", "Track record"],
];

export function Header() {
  return (
    <header className="bar">
      <a className="mark" href="#top">
        Tearsheet
      </a>
      <nav aria-label="Sections">
        {LINKS.map(([href, label]) => (
          <a key={href} href={href}>
            {label}
          </a>
        ))}
      </nav>
    </header>
  );
}
