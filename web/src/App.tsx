import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import { type Accuracy, type Decision, type GateId, type Initial, type Meta, paths, type TrackRecord as Track, useApi } from "./api";
import { Bulletins } from "./components/Bulletins";
import { DayStrip } from "./components/DayStrip";
import { Dock } from "./components/Dock";
import { DriftLadder } from "./components/DriftLadder";
import { Entrance } from "./components/Entrance";
import { Footer } from "./components/Footer";
import { GatePresets } from "./components/GatePresets";
import { GateSentence } from "./components/GateSentence";
import { Header } from "./components/Header";
import { LeadTimeChart } from "./components/LeadTimeChart";
import { Ledger } from "./components/Ledger";
import { MonthlyBias } from "./components/MonthlyBias";
import { Provenance } from "./components/Provenance";
import { TrackRecord } from "./components/TrackRecord";
import { WorstDays } from "./components/WorstDays";
import { hoursText, monthName, num, ukDay } from "./format";
import { useMedia, useMotion } from "./hooks";
import { dayFacts } from "./lib/decision";
import { deliveryDays, gateTime, periodLabels } from "./lib/meta";
import { nextGate, type View, viewFromSearch, viewSearch } from "./lib/view";
import { countUp, EASE, gsap, jumpTo, keepPlace, MASK_PAD, registerGsap, sceneMoved, ScrollTrigger, SplitText, startSmoothScroll } from "./motion";

// The opening view when no prerendered answer exists (dev): the worst January day at the default gate.
const OPENING: View = { day: "2026-01-28", gate: "epex_0920" };

const noSubscription = () => () => {};

const monthSpan = (rows: Accuracy["monthly"]) => {
  const [a, b] = [rows[0].month, rows[rows.length - 1].month];
  return `${monthName(a)} ${a.slice(0, 4)} to ${monthName(b)} ${b.slice(0, 4)}`;
};

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
  // The pinned scene needs the height for the log and the whole chart; short screens (a phone held sideways) read it in flow.
  const staged = useMedia("(min-height: 561px)") && motion;
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

  // A worst-day shortcut jumps to the chart once that day has rendered and the scene has been rebuilt.
  useEffect(() => {
    if (decision.data && pendingJump.current === decision.data.day && !decision.loading) {
      pendingJump.current = undefined;
      jumpTo("chart");
    }
  }, [decision.data, decision.loading]);

  useLayoutEffect(() => {
    if (!motion) return;
    registerGsap();
    const ctx = gsap.context(() => {
      document.querySelectorAll<HTMLElement>("section h2[data-split]").forEach((h) =>
        SplitText.create(h, {
          type: "lines",
          mask: "lines",
          linesClass: "split-line",
          autoSplit: true,
          onSplit: (self) => {
            gsap.set(self.masks, { ...MASK_PAD });
            return gsap.from(self.lines, { yPercent: 120, duration: 1.3, ease: EASE, stagger: 0.1, scrollTrigger: { trigger: h, start: "top 85%", once: true } });
          },
        }),
      );
      document.querySelectorAll<HTMLElement>("[data-count]").forEach(countUp);
    });
    return () => ctx.revert();
  }, [motion, ready]);

  // Content above the pin can change height (an open disclosure, a new day's sentence); the pin must then start where the section now is.
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
  const i = days.indexOf(view.day);
  const step = (s: number) => {
    if (days[i + s]) select({ day: days[i + s] });
  };
  return (
    <>
      <a className="skip" href="#gate">
        Skip to the day picker
      </a>
      <Entrance motion={motion} />
      <Header />
      <main id="main" className={loading ? "is-loading" : undefined}>
        <section className="hero" id="gate" aria-labelledby="hero-title" ref={hero}>
          <div className="hero-text">
            <p className="eyebrow">GB day-ahead wind backtest</p>
            <h1 id="hero-title" className="display">
              The forecast you had <em>when the gate shut.</em>
            </h1>
            <Provenance meta={meta} month={period.month} />
          </div>
          <DayStrip
            days={days}
            day={view.day}
            daily={acc.daily}
            worst={acc.worst_days.map((w) => w.day)}
            span={period.delivery}
            smooth={motion}
            onSelect={(day) => select({ day })}
          />
          <div className="console" role="group" aria-label="Choose a gate">
            <GatePresets gates={meta.gates} gate={view.gate} decision={d} onSelect={(gate: GateId) => select({ gate })} />
            <WorstDays
              worst={acc.worst_days}
              day={view.day}
              smooth={motion}
              onPick={(day) => {
                pendingJump.current = day;
                if (day === d.day) jumpTo("chart");
                else select({ day });
              }}
            />
          </div>
          <GateSentence decision={d} accuracy={acc} gateTime={shownGate} month={month} error={decision.error ?? accuracy.error} />
          <noscript>
            <p className="noscript">
              The day and gate controls need JavaScript. Without it, this page shows {ukDay(d.day)} at the {shownGate} gate.
            </p>
          </noscript>
        </section>

        <Bulletins
          staged={staged}
          smooth={smooth}
          decision={d}
          hour={hour}
          margin={margin}
          gateTime={shownGate}
          marginDays={meta.margin_window_days}
          onHour={setHour}
          onMargin={() => setMargin((on) => !on)}
        />

        <DriftLadder decision={d} hour={hour} onHour={setHour} />

        <section className="accuracy" id="accuracy" aria-labelledby="accuracy-title">
          <div className="wrap">
            <p className="eyebrow">Accuracy</p>
            <h2 id="accuracy-title" className="display" data-split>
              The gap you carry, <em>in megawatts.</em>
            </h2>
            <p className="lede">
              At the {shownGate} gate, delivery days {period.delivery}: {num(acc.headline.n)} hours, each compared with metered wind.
            </p>
            <Ledger headline={acc.headline} gateTime={shownGate} period={`Delivery days ${period.delivery} (decisions made ${period.decisions})`} />
            <div className="acc-grid">
              <figure className="panel">
                <figcaption>
                  <h3>The gap grows with lead time</h3>
                  <p>
                    Mean absolute error by hours ahead, every run published in the two days before delivery. Marked: the lead times the {shownGate} gate used for {ukDay(d.day)} ({hoursText(facts.h0)} to {hoursText(facts.h1)} h).
                  </p>
                </figcaption>
                <LeadTimeChart rows={acc.by_lead_time} h0={facts.h0} h1={facts.h1} />
              </figure>
              <figure className="panel">
                <figcaption>
                  <h3>Above metered wind every month</h3>
                  <p>
                    Mean bias at this gate by calendar month, {monthSpan(acc.monthly)}. {month} here is the whole calendar month, so it differs a little from the ledger above, which counts delivery days {period.delivery}. Positive means the forecast ran above metered wind.
                  </p>
                </figcaption>
                <MonthlyBias rows={acc.monthly} scored={meta.delivery_first.slice(0, 7)} />
              </figure>
            </div>
          </div>
        </section>

        <TrackRecord record={record} meta={meta} gate={d.gate} delivery={period.delivery} month={month} />
      </main>
      <Footer meta={meta} month={period.month} />
      <Dock day={view.day} gateTime={gateTime(meta, view.gate)} canPrev={i > 0} canNext={i < days.length - 1} onStep={step} onCycleGate={() => select({ gate: nextGate(view.gate) })} />
    </>
  );
}
