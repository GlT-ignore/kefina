import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Lenis from "lenis";

export { gsap, ScrollTrigger, SplitText };

export const EASE = "power3.out";

// SplitText masks clip at the line box, and at tight line-heights descenders reach past it. Only the bottom is padded:
// a negative top margin would collapse into the line above's negative bottom margin and push the heading down.
export const MASK_PAD = { paddingBottom: "0.16em", marginBottom: "-0.16em" };

let registered = false;
export function registerGsap(): void {
  if (registered) return;
  gsap.registerPlugin(ScrollTrigger, SplitText);
  registered = true;
}

let lenis: Lenis | undefined;
let scene: ScrollTrigger | undefined;

/** Lenis smooth scroll driven by the GSAP ticker, so pins and scrubs read the same scroll. */
export function startSmoothScroll(): () => void {
  registerGsap();
  const instance = new Lenis({ autoRaf: false });
  const raf = (t: number) => instance.raf(t * 1000);
  instance.on("scroll", ScrollTrigger.update);
  gsap.ticker.add(raf);
  gsap.ticker.lagSmoothing(0);
  lenis = instance;
  return () => {
    gsap.ticker.remove(raf);
    gsap.ticker.lagSmoothing(500, 33);
    instance.destroy();
    lenis = undefined;
  };
}

/** The pinned scene's trigger, so "go to the ticket" can land where the print has finished. */
export function setScene(trigger: ScrollTrigger | undefined): void {
  scene = trigger;
}

/** Whether content above the pinned scene has moved since its scroll positions were measured. */
export function sceneMoved(): boolean {
  const spacer = scene?.pin?.parentElement;
  if (!scene || !spacer) return false;
  return Math.abs(scene.start - (spacer.getBoundingClientRect().top + window.scrollY)) > 1;
}

export function scrollToY(y: number, smooth: boolean): void {
  const top = Math.max(0, y);
  if (lenis) {
    // Lenis clamps to the page height it last measured, which lags a pin or a resize by up to a frame.
    lenis.resize();
    lenis.scrollTo(top, { immediate: !smooth, force: true });
  } else {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top, behavior: smooth && !reduced ? "smooth" : "auto" });
  }
}

/** Where an element sits in the page, ignoring transforms: before the tear the ticket is drawn shifted under the printer head. */
function layoutTop(el: HTMLElement): number {
  let y = 0;
  for (let n: Element | null = el; n instanceof HTMLElement; n = n.offsetParent) y += n.offsetTop;
  return y;
}

export function jumpTo(id: string): void {
  if (id === "chart" && scene) return scrollToY(scene.end, true);
  const el = document.getElementById(id);
  if (!el) return;
  // An unpinned ticket that does not fit the screen down to its chart (a phone held sideways) lands on the chart instead.
  const plot = (id === "chart" || id === "ticket") && !scene ? document.querySelector<HTMLElement>("#chart .chart-box") : null;
  if (plot && layoutTop(plot) + plot.offsetHeight - layoutTop(el) > window.innerHeight) return scrollToY(layoutTop(plot) - 8, true);
  scrollToY(topOf(el) - 8, true);
}

/** Where the reader is, in terms that survive re-measuring: progress through the ticket scene, or a landmark and its offset. */
type Place = { progress: number } | { index: number; offset: number };

// The same list with or without the pin, so a landmark's index survives the pin coming and going across 960 px.
const landmarks = () => [...document.querySelectorAll<HTMLElement>("main section, main h2, main h3, footer")];
// A pinned section moves with its pin; its spacer holds its place in the page.
const topOf = (el: Element) => (el.closest(".pin-spacer") ?? el).getBoundingClientRect().top + window.scrollY;

function sceneRange(): [number, number] | undefined {
  if (scene) return [scene.start, scene.end];
  const sec = document.getElementById("ticket");
  if (!sec) return undefined;
  const top = topOf(sec);
  return [top, top + Math.max(1, sec.offsetHeight - window.innerHeight)];
}

function readPlace(): Place | undefined {
  const y = window.scrollY;
  const range = sceneRange();
  if (range && y >= range[0] && y <= range[1]) return { progress: (y - range[0]) / (range[1] - range[0]) };
  const line = y + window.innerHeight / 2;
  const marks = landmarks();
  // Landmarks come in page order, so the last one above the middle of the screen is the one being read.
  const index = marks.findLastIndex((el) => topOf(el) <= line);
  return index < 0 ? undefined : { index, offset: topOf(marks[index]) - y };
}

function placeY(place: Place): number | undefined {
  if ("progress" in place) {
    const range = sceneRange();
    return range && range[0] + place.progress * (range[1] - range[0]);
  }
  const el = landmarks()[place.index];
  return el && topOf(el) - place.offset;
}

/**
 * After a resize, a rotation or a reload, ScrollTrigger re-measures the pin and puts back the old pixel offset,
 * which by then points somewhere else. This puts the reader back on what they were reading instead.
 */
export function keepPlace(): () => void {
  registerGsap();
  const KEY = "tearsheet-place";
  const SETTLE = 1000;
  let place: Place | undefined;
  let settleUntil = 0;
  let frame = 0;
  // Recorded as the page moves, not when it stops: a resize can come while a smooth scroll is still gliding.
  const record = () => {
    frame = 0;
    if (performance.now() > settleUntil) place = readPlace();
  };
  const onScroll = () => {
    frame ||= requestAnimationFrame(record);
  };
  const restore = () => {
    const y = performance.now() <= settleUntil && place ? placeY(place) : undefined;
    if (y !== undefined) scrollToY(y, false);
  };
  let width = window.innerWidth;
  // A phone's address bar resizes the window on every swipe; only a real resize should hold the recorded place.
  const resized = () => {
    if (window.innerWidth === width && ScrollTrigger.isTouch === 1) return;
    width = window.innerWidth;
    settleUntil = performance.now() + SETTLE;
  };
  const save = () => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(readPlace() ?? null));
    } catch {
      // Storage can be refused; a reload then starts at the top.
    }
  };

  const restoration = history.scrollRestoration;
  history.scrollRestoration = "manual";
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  let saved: unknown;
  try {
    if (nav && nav.type !== "navigate") saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
  } catch {
    // Unreadable storage means no saved place; the page opens at the top.
  }
  if (saved && typeof saved === "object") {
    place = saved as Place;
    settleUntil = performance.now() + SETTLE;
    restore();
  } else record();

  window.addEventListener("scroll", onScroll, { passive: true });
  ScrollTrigger.addEventListener("refresh", restore);
  window.addEventListener("resize", resized);
  window.addEventListener("pagehide", save);
  return () => {
    window.removeEventListener("scroll", onScroll);
    cancelAnimationFrame(frame);
    ScrollTrigger.removeEventListener("refresh", restore);
    window.removeEventListener("resize", resized);
    window.removeEventListener("pagehide", save);
    history.scrollRestoration = restoration;
  };
}
