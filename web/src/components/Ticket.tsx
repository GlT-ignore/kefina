import { useCallback, useLayoutEffect, useRef, useState } from "react";

import type { Decision } from "../api";
import { mw, num, ukClock, ukDay, ukTime } from "../format";
import { dayFacts, gateSentence, longDay, rollNote, type RunLine, runLines } from "../lib/decision";
import { PHASE, printed, seg } from "../lib/scene";
import { gsap, registerGsap, ScrollTrigger, scrollToY, setScene } from "../motion";
import { ForecastChart } from "./ForecastChart";

interface Props {
  decision: Decision;
  /** "EPEX hourly auction" */
  auction: string;
  gateTime: string;
  /** "The worst January day at 09:20", or empty. */
  worst: string;
  hour: number;
  margin: boolean;
  marginDays: number;
  motion: boolean;
  smooth: boolean;
  error?: string;
  onHour: (i: number) => void;
  onMargin: () => void;
}

/** The DOM the scene draws on, collected after each render. */
interface Parts {
  ticket: HTMLElement;
  roll: HTMLElement;
  perf: HTMLElement;
  stamp: HTMLElement;
  clock: HTMLElement;
  clockTime: Text;
  clockDay: Text;
  head: Text;
  carriage: HTMLElement;
  log: HTMLElement[];
  rollLines: HTMLElement[];
  rollTitle: HTMLElement;
  rollNote: HTMLElement;
  runs: SVGPathElement[];
  inked: (HTMLElement | SVGElement)[];
  metered: SVGPathElement;
}

interface Story {
  pre: RunLine[];
  usedIdx: number;
  post: RunLine[];
  day: string;
  cutoff: string;
}

const SEEN = "tearsheet-seen";

function seen(): boolean {
  try {
    return localStorage.getItem(SEEN) === "1";
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN, "1");
  } catch {
    // Storage can be refused in private windows; the print then plays again next visit.
  }
}

function collect(stage: HTMLElement): Parts {
  const one = <T extends Element>(sel: string) => stage.querySelector(sel) as T;
  const all = <T extends Element>(sel: string) => [...stage.querySelectorAll<T>(sel)];
  return {
    ticket: one(".ticket"),
    roll: one(".roll"),
    perf: one(".perf"),
    stamp: one(".stamp"),
    clock: one(".clock"),
    clockTime: one(".clock-time").firstChild as Text,
    clockDay: one(".clock-day").firstChild as Text,
    head: one(".head-text").firstChild as Text,
    carriage: one(".carriage"),
    log: all(".t-log .line"),
    rollLines: all(".roll .line"),
    rollTitle: one(".roll-title"),
    rollNote: one(".roll-note"),
    runs: all(".chart .run"),
    inked: all(".chart .gap, .chart .hour-marks, .readout"),
    metered: one(".chart .metered"),
  };
}

const clip = (f: number) => (f >= 1 ? "" : `inset(0 ${((1 - f) * 100).toFixed(1)}% 0 0)`);
const write = (node: Text, text: string) => {
  if (node.nodeValue !== text) node.nodeValue = text;
};
const settledHead = (cutoff: string) => `Gate closed ${ukDay(cutoff)}, ${ukTime(cutoff)}. Metered wind stamped.`;

/**
 * Draws the whole scene for any progress from 0 (nothing printed) to 1 (the settled ticket React rendered),
 * so a new day, gate or hour mid-scrub is drawn correctly at once.
 */
function draw(el: Parts, s: Story, shift: { dx: number; dy: number }, p: number): void {
  const pre = printed(el.log.length, PHASE.printA, PHASE.printB, p);
  el.log.forEach((li, i) => (li.style.clipPath = clip(pre.fr[i])));
  el.runs.forEach((path, i) => {
    const f = pre.fr[i] ?? 1;
    path.style.strokeDasharray = f >= 1 ? "" : "1 1";
    path.style.strokeDashoffset = f >= 1 ? "" : String(1 - f);
    path.classList.toggle("is-latest", i === (p >= 1 ? s.usedIdx : pre.last));
  });

  const perf = seg(p, PHASE.printB, PHASE.perfB);
  const tear = seg(p, PHASE.perfB, PHASE.tearB);
  const te = 0.5 - 0.5 * Math.cos(Math.PI * tear);
  el.perf.style.clipPath = clip(perf);
  el.perf.style.opacity = perf > 0 && tear === 0 ? "1" : "";
  el.ticket.classList.toggle("is-whole", tear === 0);
  el.ticket.classList.toggle("is-moving", tear > 0 && tear < 1);
  const rot = -1.6 * Math.sin(Math.PI * te);
  el.ticket.style.transform = tear >= 1 ? "" : `translate(${(shift.dx * (1 - te)).toFixed(1)}px, ${(shift.dy * (1 - te)).toFixed(1)}px) rotate(${rot.toFixed(2)}deg)`;
  // The clock clears the desk before the ticket slides over it.
  const away = seg(tear, 0, 0.15);
  el.clock.style.opacity = away > 0 ? String(1 - away) : "";
  el.clock.style.visibility = away < 1 ? "visible" : "";

  const post = printed(el.rollLines.length, PHASE.tearB + 0.02, PHASE.rollB, p);
  el.rollLines.forEach((li, i) => (li.style.clipPath = clip(post.fr[i])));
  el.rollTitle.style.clipPath = clip(seg(p, PHASE.tearB, PHASE.tearB + 0.02));
  el.rollNote.style.clipPath = clip(seg(p, PHASE.rollB, PHASE.stampA));

  const st = seg(p, PHASE.stampA, PHASE.stampB);
  el.stamp.style.opacity = st > 0 ? "" : "0";
  el.stamp.style.transform = st >= 1 ? "" : `rotate(-6deg) scale(${(1.7 - 0.7 * st * st).toFixed(3)})`;
  // Metered wind, the gap and the hour reading belong to the finished ticket, so they arrive with the stamp.
  const ink = seg(st, 0.75, 1);
  el.inked.forEach((n) => (n.style.opacity = st >= 1 ? "" : String(ink)));
  el.metered.style.opacity = st >= 1 ? "" : String(ink);
  el.metered.style.strokeWidth = st >= 1 ? "" : String(7 - 4.5 * ink);

  // The carriage rides along the head while a line prints.
  const live = post.last >= 0 && post.live < 1 ? post.live : pre.last >= 0 && pre.live < 1 && tear === 0 ? pre.live : 0;
  el.carriage.style.setProperty("--x", live.toFixed(3));

  const gateAt = `${ukDay(s.cutoff)}, ${ukTime(s.cutoff)}`;
  const run = s.pre[Math.max(0, pre.last)]?.time ?? s.cutoff;
  const after = s.post[post.last]?.time;
  let head = `Waiting for the ${ukDay(run)}, ${ukClock(run)} run`;
  if (p >= 1) head = settledHead(s.cutoff);
  else if (st > 0) head = `Metered wind for ${ukDay(s.day)} stamped on the ticket`;
  else if (after) head = `After the gate: ${ukDay(after)}, ${ukClock(after)} run printed on the roll`;
  else if (perf > 0) head = `Gate closes ${gateAt}. Tear along the line.`;
  else if (pre.last >= 0) head = `${ukDay(run)}, ${ukClock(run)} run printed`;
  write(el.head, head);
  const shown = perf > 0 ? s.cutoff : run;
  write(el.clockTime, ukClock(shown));
  write(el.clockDay, ukDay(shown));
  el.clock.classList.toggle("at-gate", perf > 0);
}

/**
 * The ticket for one delivery day. On a first visit with motion, the runs print onto it at their publish times,
 * the gate tears it off, later runs print on the roll left in the printer, and metered wind is stamped across it.
 */
export function Ticket({ decision: d, auction, gateTime, worst, hour, margin, marginDays, motion, smooth, error, onHour, onMargin }: Props) {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const parts = useRef<Parts>(undefined);
  const story = useRef<Story>(undefined);
  const shift = useRef({ dx: 0, dy: 0 });
  const scene = useRef({ p: 1 });
  const replay = useRef<() => void>(undefined);
  const [phase, setPhase] = useState<"blank" | "printing" | "done">("done");
  const lines = runLines(d);
  const pre = lines.filter((l) => !l.after);
  const post = lines.filter((l) => l.after);
  const f = dayFacts(d);
  const usedIdx = pre.findIndex((l) => l.time === f.run);
  const at = ukClock(d.hours[hour].start_time);
  const key = `${d.day} ${d.gate}`;

  const repaint = useCallback(() => {
    const el = parts.current;
    const s = story.current;
    const p = scene.current.p;
    if (el && s) draw(el, s, shift.current, p);
    setPhase(p <= 0 ? "blank" : p < 1 ? "printing" : "done");
  }, []);

  // Before the tear the ticket sits under the printer head, over the roll.
  const measure = useCallback(() => {
    const el = parts.current;
    if (el) shift.current = { dx: el.roll.offsetLeft - el.ticket.offsetLeft, dy: el.roll.offsetTop - el.ticket.offsetTop };
  }, []);

  // Every render can bring new lines and paths; the scene redraws them at the current progress.
  useLayoutEffect(() => {
    if (!stage.current) return;
    parts.current = collect(stage.current);
    story.current = { pre, usedIdx, post, day: d.day, cutoff: d.cutoff };
    measure();
    repaint();
  });

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      measure();
      repaint();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, repaint]);

  // A new day or gate on a settled ticket prints again, quickly.
  const printedKey = useRef(key);
  useLayoutEffect(() => {
    const el = parts.current;
    if (printedKey.current === key) return;
    printedKey.current = key;
    if (!motion || !el || scene.current.p < 1) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(el.log, { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.28, ease: "power2.out", stagger: 0.025, clearProps: "clipPath" });
      gsap.fromTo(el.rollLines, { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.28, ease: "power2.out", stagger: 0.03, delay: 0.25, clearProps: "clipPath" });
      gsap.fromTo(el.runs, { strokeDasharray: "1 1", strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.5, ease: "power2.out", stagger: 0.02, clearProps: "strokeDasharray,strokeDashoffset" });
      gsap.fromTo(el.stamp, { scale: 1.5, rotate: -6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.22, ease: "power3.in", delay: 0.45, clearProps: "transform,opacity" });
      gsap.fromTo([el.metered, ...el.inked], { opacity: 0 }, { opacity: 1, duration: 0.15, delay: 0.62, clearProps: "opacity" });
    });
    return () => ctx.revert();
  }, [key, motion]);

  useLayoutEffect(() => {
    const sec = section.current;
    const box = stage.current;
    const pinned = sec?.querySelector<HTMLElement>(".scene");
    if (!motion || !box || !pinned) return;
    registerGsap();
    const state = scene.current;
    let play: gsap.core.Tween | undefined;
    let pin: ScrollTrigger | undefined;
    const set = (p: number) => {
      state.p = p;
      repaint();
    };
    // A skip glides to the end of the pin; if the pin re-measures during the glide, the glide is aimed at the new end.
    let skipUntil = 0;
    const run = (duration: number) => {
      play?.kill();
      play = gsap.fromTo(state, { p: 0 }, { p: 1, duration, ease: "none", onUpdate: repaint, onComplete: markSeen });
    };
    const skip = () => {
      if (play?.isActive()) play.timeScale(6);
      else if (pin && state.p > 0 && state.p < 1) {
        skipUntil = performance.now() + 1500;
        scrollToY(pin.end, true);
      }
    };
    // Lands on the finished ticket in this frame: the scrub would otherwise catch up over the next 0.35 s.
    const finish = () => {
      play?.kill();
      if (pin) {
        scrollToY(pin.end, false);
        pin.getTween()?.progress(1);
        pin.animation?.progress(1);
      } else set(1);
      markSeen();
    };
    replay.current = () => (state.p > 0 && state.p < 1 ? skip() : run(3.2));
    // Any input other than scrolling fast-forwards the print, except keys meant for a control outside the scene:
    // skipping would scroll the page away from the control the key just moved focus to.
    const onInput = (e: Event) => {
      if (e instanceof KeyboardEvent && (e.key === "Tab" || e.key === "Shift" || (e.target instanceof Element && e.target !== document.body && !pinned.contains(e.target)))) return;
      if (state.p > 0 && state.p < 1) skip();
    };
    // Keyboard focus landing in the scene opens the finished ticket, so a control is never read half printed.
    const onFocus = (e: FocusEvent) => {
      const to = e.target;
      if (!(to instanceof HTMLElement) || !pinned.contains(to) || !to.matches(":focus-visible")) return;
      if (state.p < 1) finish();
      // The browser then scrolls the control into view, which from below the pin can land back inside it.
      requestAnimationFrame(() => pin && window.scrollY < pin.end - 1 && finish());
    };
    addEventListener("pointerdown", onInput, { passive: true });
    addEventListener("keydown", onInput, { passive: true });
    document.addEventListener("focusin", onFocus);

    const mm = gsap.matchMedia();
    // gsap.matchMedia runs only while one of its queries matches, so both widths are named.
    mm.add({ wide: "(min-width: 960px)", narrow: "(max-width: 959.98px)" }, (ctx) => {
      if (seen()) return set(1);
      set(0);
      // Pin only when the whole scene fits the screen; otherwise it plays through once on arrival.
      if (!ctx.conditions?.wide || pinned.offsetHeight > window.innerHeight) {
        ScrollTrigger.create({ trigger: box, start: "top 75%", once: true, onEnter: () => state.p < 1 && run(4.2) });
        return;
      }
      const tween = gsap.to(state, {
        p: 1,
        ease: "none",
        // Scrolling inside the pin takes the scene back from a replay, so only one of them draws it.
        onUpdate: () => {
          play?.kill();
          repaint();
        },
        scrollTrigger: {
          trigger: pinned,
          start: "top top",
          end: () => `+=${Math.round(window.innerHeight * 2)}`,
          pin: true,
          pinType: smooth ? "transform" : "fixed",
          scrub: 0.35,
          onRefresh: () => {
            measure();
            repaint();
            if (pin && state.p < 1 && performance.now() < skipUntil) scrollToY(pin.end, true);
          },
          // While the pin is being created it reports a leave for whatever scroll a reload starts at, before `pin` is set.
          onLeave: () => pin && markSeen(),
        },
      });
      pin = tween.scrollTrigger;
      setScene(pin);
      // A new day can make the ticket taller or shorter; the pin then measures again.
      let timer: number | undefined;
      const observer = new ResizeObserver(() => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => ScrollTrigger.refresh(), 120);
      });
      observer.observe(box);
      return () => {
        observer.disconnect();
        window.clearTimeout(timer);
        setScene(undefined);
        pin = undefined;
      };
    });
    return () => {
      removeEventListener("pointerdown", onInput);
      removeEventListener("keydown", onInput);
      document.removeEventListener("focusin", onFocus);
      play?.kill();
      mm.revert();
      replay.current = undefined;
      set(1);
    };
  }, [motion, smooth, measure, repaint]);

  const valueAt = (l: RunLine) => {
    const v = l.values[hour];
    return v === undefined ? "not covered" : num(v);
  };

  return (
    <section id="ticket" className="scene-wrap" aria-labelledby="ticket-title" ref={section}>
      <div className="scene">
        <div className="scene-top">
          <div>
            <h2 id="ticket-title">{longDay(d.day)}</h2>
            <p className="gate-line" aria-live="polite">
              {gateSentence(d)}
            </p>
            {error && <p className="error">Could not load that view ({error}). The last loaded day is still shown.</p>}
          </div>
          <div className="scene-actions">
            <button type="button" className="margin-btn" aria-pressed={margin} onClick={onMargin}>
              Forecast minus {marginDays}-day margin (backtest)
            </button>
            {/* Before anything prints it is hidden, not removed: the pin has measured the scene with it in place. */}
            {motion && (
              <button type="button" className="replay" style={phase === "blank" ? { visibility: "hidden" } : undefined} onClick={() => replay.current?.()}>
                {phase === "printing" ? "Skip the printing" : "Print it again"}
              </button>
            )}
          </div>
        </div>

        <div className="stage" ref={stage}>
          <div className="clock" aria-hidden="true">
            <span className="clock-time">{ukClock(d.cutoff)}</span>
            <span className="clock-day">{ukDay(d.cutoff)}</span>
            <span className="clock-gate">Gate closes at {gateTime}</span>
          </div>
          <div className="head" aria-hidden="true">
            <span className="head-text">{settledHead(d.cutoff)}</span>
            <span className="carriage" />
          </div>
          <div className="roll">
            <div className="roll-inner" data-ui>
              <p className="roll-title">
                {post.length ? `Printed after the gate, so not on your ticket. MW at ${at}` : "No run was printed after the gate for this day."}
              </p>
              <ol>
                {post.map((l) => (
                  <li className="line" key={l.time}>
                    <span className="l-time">{`${ukDay(l.time)}, ${ukClock(l.time)}`}</span>
                    <span className="l-val">{valueAt(l)}</span>
                  </li>
                ))}
              </ol>
              <p className="roll-note">{rollNote(d, lines, hour)}</p>
            </div>
          </div>
          <article className="ticket" id="chart" aria-label="Your ticket for this delivery day">
            <div className="perf" aria-hidden="true" />
            <header className="t-head">
              <div>
                <p className="t-day">
                  Delivery {ukDay(d.day)} {d.day.slice(0, 4)}
                </p>
                <p className="t-gate">
                  {auction}, gate {ukTime(d.cutoff)}
                </p>
              </div>
              <div className="t-tags">
                {worst && <p className="t-worst">{worst}</p>}
                <p className="t-mean">
                  Mean miss {mw(f.meanAbs)}, bias {mw(f.meanGap, true)}
                </p>
              </div>
            </header>
            <div className="t-body">
              <ForecastChart decision={d} runs={pre} usedIdx={usedIdx} hour={hour} margin={margin} onHour={onHour} />
              <div className="t-log" data-ui>
                <p className="log-title">Runs before the gate, MW at {at}</p>
                <ol>
                  {pre.map((l, i) => (
                    <li className={i === usedIdx ? "line is-used" : "line"} key={l.time}>
                      <span className="l-time">{`${ukDay(l.time)}, ${ukClock(l.time)}`}</span>
                      <span className="l-val">{valueAt(l)}</span>
                      {i === usedIdx && <span className="l-note">You had this run</span>}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            <footer className="t-foot">
              <ul className="key">
                <li>
                  <span className="sw sw-used" />
                  Forecast you had, {ukClock(f.run)} run
                </li>
                <li>
                  <span className="sw sw-run" />
                  Earlier runs before the gate
                </li>
                <li>
                  <span className="sw sw-met" />
                  Metered wind
                </li>
                {margin && (
                  <li>
                    <span className="sw sw-margin" />
                    Forecast minus {marginDays}-day margin (backtest)
                  </li>
                )}
              </ul>
              <p className="t-hint">Point at the chart, or focus it and use the arrow keys, to read any hour.</p>
            </footer>
            <div className="stamp" aria-hidden="true">
              <span className="stamp-word">Metered</span>
              <span className="stamp-day">{ukDay(d.day)}</span>
            </div>
          </article>
        </div>
      </div>

      <details className="hours">
        <summary>All {d.hours.length} hours as figures</summary>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="All hours as figures">
          <table data-ui>
            <caption>
              {longDay(d.day)}, {ukClock(f.run)} run, MW
            </caption>
            <thead>
              <tr>
                <th scope="col">Hour, {ukTime(d.cutoff).slice(6)}</th>
                <th scope="col">Forecast you had</th>
                <th scope="col">Metered</th>
                <th scope="col">Forecast minus metered</th>
                <th scope="col">Minus {marginDays}-day margin</th>
              </tr>
            </thead>
            <tbody>
              {d.hours.map((q) => (
                <tr key={q.start_time}>
                  <th scope="row">{ukClock(q.start_time)}</th>
                  <td>{num(q.forecast_mw)}</td>
                  <td>{num(q.actual_mw)}</td>
                  <td>{num(q.error_mw, true)}</td>
                  <td>{num(q.forecast_mw - (q.margin_mw ?? 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
