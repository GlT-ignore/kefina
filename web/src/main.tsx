import "lenis/dist/lenis.css";
import "./styles.css";

import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";

import { type Initial, seedCache } from "./api";
import App from "./App";

const page = window as { __INITIAL__?: Initial; __app?: boolean };
// Tells the head script the app arrived, so it stops its own fallbacks.
page.__app = true;

const root = document.getElementById("root")!;
const initial = page.__INITIAL__;

if (initial) {
  seedCache(initial);
  hydrateRoot(root, <StrictMode><App initial={initial} /></StrictMode>);
} else {
  createRoot(root).render(<StrictMode><App /></StrictMode>);
}
