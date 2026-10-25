import { renderToString } from "react-dom/server";

import { type Initial, seedCache } from "./api";
import App from "./App";

export function render(initial: Initial): string {
  seedCache(initial);
  return renderToString(<App initial={initial} />);
}
