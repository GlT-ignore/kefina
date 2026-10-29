import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import { type Accuracy, type Decision, type GateId, type Initial, type Meta, paths, type TrackRecord as Track, useApi } from "./api";
import { DayStrip } from "./components/DayStrip";
import { Footer } from "./components/Footer";
import { GatePresets } from "./components/GatePresets";
import { Header } from "./components/Header";
import { Statement } from "./components/Statement";
import { Ticket } from "./components/Ticket";
import { TrackRecord } from "./components/TrackRecord";
import { WorstDays } from "./components/WorstDays";
import { ukDay } from "./format";
import { useMedia, useMotion } from "./hooks";
import { dayFacts, worstLabel } from "./lib/decision";
import { deliveryDays, gateName, gateTime, periodLabels } from "./lib/meta";
import { type View, viewFromSearch, viewSearch } from "./lib/view";
import { EASE, gsap, jumpTo, keepPlace, MASK_PAD, registerGsap, sceneMoved, ScrollTrigger, SplitText, startSmoothScroll } from "./motion";

// The opening view when no prerendered answer exists (dev): the worst January day at the default gate.
const OPENING: View = { day: "2026-01-28", gate: "epex_0920" };

const noSubscription = () => () => {};

export default function App({ initial }: { initial?: Initial }) {
  const [chosen, setChosen] = useState<View>();
  const [picked, setPicked] = useState<{ key: string; hour: number }>();
  const [margin, setMargin] = useState(false);
  const meta = useApi<Meta>(paths.meta).data;
  const days = meta ? deliveryDays(meta.delivery_first, meta.delivery_last) : [];
  // Deep links: the server snapshot has no query, so ?day=&gate= is read only after hydration and the first renders match.
  const search = useSyncExternalStore(noSubscription, () => window.location.search, () => "");
  const opening = initial ? { day: initial.decision.day, gate: initial.decision.gate } : OPENING;
  const view = chosen ?? viewFromSearch(search, days, opening);
  const decision = useApi<Decision>(paths.decision(view.day, view.gate));
  const accuracy = useApi<Accuracy>(paths.accuracy(view.gate));
  const record = useApi<Track>(paths.trackRecord).data;
  const motion = useMotion();
  const smooth = useMedia("(pointer: fine)") && motion;
  const pendingJump = useRef<string>(undefined);
  const ready = Boolean(meta && decision.data && accuracy.data && record);
  const hero = useRef<HTMLElement>(null);

  const select = (patch: Partial<View>) => {
    const next = { ...view, ...patch };
    setChosen(next);
    window.history.replaceState(undefined, "", `${viewSearch(next)}${window.location.hash}`);
  };

  useEffect(() => {
    if (!smooth) return;
    return startSmoothScroll();
  }, [smooth]);

  useEffect(() => (motion ? keepPlace() : undefined), [motion]);

  // In-page links scroll through Lenis and land past the pinned scene.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]:not(.skip)');
      if (!a || a.hash.length < 2 || !document.getElementById(a.hash.slice(1))) return;
      e.preventDefault();
      jumpTo(a.hash.slice(1));
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // A worst-day shortcut jumps to the ticket once that day has rendered.
  useEffect(() => {
    if (decision.data && pendingJump.current === decision.data.day && !decision.loading) {
      pendingJump.current = undefined;
      jumpTo("chart");
    }
  }, [decision.data, decision.loading]);

  useLayoutEffect(() => {
    if (!motion || !ready) return;
    registerGsap();
    const once = (trigger: Element | string, start = "top 85%") => ({ trigger, start, once: true });
    // A reveal that holds a control finishes as soon as the keyboard reaches it, so focus never lands on a faded control.
    const reveals: [Element, gsap.core.Tween][] = [];
    const onFocus = (e: FocusEvent) => reveals.forEach(([root, tween]) => root.contains(e.target as Node) && tween.progress(1));
    const ctx = gsap.context(() => {
      const rise = (h: HTMLElement, scrollTrigger?: ScrollTrigger.Vars) =>
        SplitText.create(h, {
          type: "lines",
          mask: "lines",
          autoSplit: true,
          onSplit: (self) => {
            gsap.set(self.masks, { ...MASK_PAD });
            return gsap.from(self.lines, { yPercent: 115, duration: 0.8, ease: "expo.out", stagger: 0.08, scrollTrigger });
          },
        });
      const h1 = document.getElementById("hero-title");
      if (h1) rise(h1);
      document.querySelectorAll<HTMLElement>("h2[data-split]").forEach((h) => rise(h, once(h, "top 88%")));
      document.querySelectorAll(".sheet table").forEach((table) =>
        reveals.push([table, gsap.from(table.querySelectorAll("tr"), { clipPath: "inset(0 100% 0 0)", duration: 0.35, ease: "power2.out", stagger: 0.05, clearProps: "clipPath", scrollTrigger: once(table) })]),
      );
      document.querySelectorAll(".sheet-split .part").forEach((part) => gsap.from(part.querySelectorAll(".meter"), { scaleX: 0, duration: 0.6, ease: EASE, stagger: 0.03, scrollTrigger: once(part) }));
      const row = document.querySelector(".stub-row");
      if (row) reveals.push([row, gsap.from(".stub-card", { x: 48, rotate: 2.5, opacity: 0, duration: 0.6, ease: EASE, stagger: 0.12, scrollTrigger: once(row, "top 80%") })]);
      gsap.from(".stub-card .sc-bar span", { scaleX: 0, duration: 0.7, ease: EASE, stagger: 0.05, delay: 0.3, scrollTrigger: once(".stub-row", "top 80%") });
    });
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("focusin", onFocus);
      ctx.revert();
    };
  }, [motion, ready]);

  // Content above the pin can change height (an open disclosure, a new gate's note); the pin must then start where the scene now is.
  useEffect(() => {
    const el = hero.current;
    if (!el || !motion) return;
    let timer: number | undefined;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => sceneMoved() && ScrollTrigger.refresh(), 120);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [motion, ready]);

  const loading = decision.loading || accuracy.loading;

  // The head script marks a deep link to another view; the prerendered opening view shows as loading until the linked one is in.
  // `search` is still the server's empty snapshot during hydration, before the linked view has even been asked for.
  useEffect(() => {
    if (!loading && (chosen || search)) document.documentElement.classList.remove("deep-link");
  }, [loading, chosen, search]);

  const d = decision.data;
  const acc = accuracy.data;
  if (!meta || !d || !acc || !record) return <p className="boot">Loading the snapshot.</p>;

  const key = `${d.day} ${d.gate}`;
  const facts = dayFacts(d);
  const hour = picked?.key === key ? picked.hour : facts.worstIdx;
  const setHour = (i: number) => setPicked({ key, hour: Math.max(0, Math.min(d.hours.length - 1, i)) });
  const period = periodLabels(meta);
  const month = period.month.split(" ")[0];
  const shownGate = gateTime(meta, d.gate);
  const gate = meta.gates.find((g) => g.id === d.gate);
  return (
    <>
      <a className="skip" href="#days">
        Skip to the day picker
      </a>
      <Header />
      <main id="top" className={loading ? "is-loading" : undefined}>
        <section className="hero" id="gate" aria-labelledby="hero-title" ref={hero}>
          <h1 id="hero-title">The forecast you bid&nbsp;on</h1>
          <div className="hero-side">
            <p className="lead">
              Pick a {month} delivery day and an auction gate. The ticket holds the GB wind forecast you had when the auction closed. The next day, metered wind is stamped across it.
            </p>
            <div className="hero-controls">
              <GatePresets gates={meta.gates} gate={view.gate} decision={d} onSelect={(g: GateId) => select({ gate: g })} />
              <WorstDays
                worst={acc.worst_days}
                month={month}
                gateTime={shownGate}
                day={view.day}
                onPick={(day) => {
                  pendingJump.current = day;
                  if (day === d.day) jumpTo("chart");
                  else select({ day });
                }}
              />
            </div>
          </div>
          <DayStrip days={days} day={view.day} daily={acc.daily} worst={acc.worst_days.map((w) => w.day)} motion={motion} onSelect={(day) => select({ day })} />
          <p className="stubs-note">Each stub is a delivery day. Its bar is the day's mean miss, forecast against metered wind.</p>
          <noscript>
            <p className="noscript">
              The day and gate controls need JavaScript. Without it, this page shows {ukDay(d.day)} at the {shownGate} gate.
            </p>
          </noscript>
        </section>

        <Ticket
          decision={d}
          auction={gate ? `${gateName(gate)} auction` : ""}
          gateTime={shownGate}
          worst={worstLabel(
            acc.worst_days.findIndex((w) => w.day === d.day),
            month,
            shownGate,
          )}
          hour={hour}
          margin={margin}
          marginDays={meta.margin_window_days}
          motion={motion}
          smooth={smooth}
          error={decision.error ?? accuracy.error}
          onHour={setHour}
          onMargin={() => setMargin((on) => !on)}
        />

        <Statement accuracy={acc} gateTime={shownGate} delivery={period.delivery} decisions={period.decisions} month={period.month} />

        <TrackRecord record={record} meta={meta} delivery={period.delivery} month={period.month} />
      </main>
      <Footer meta={meta} month={period.month} />
    </>
  );
}
