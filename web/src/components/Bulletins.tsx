import { type ComponentProps, useLayoutEffect, useRef } from "react";

import { ukClock, ukDay, ukTime } from "../format";
import { minutesOf } from "../lib/decision";
import { gsap, registerGsap, ScrollTrigger, scrollToY, setScene } from "../motion";
import { BulletinLog } from "./BulletinLog";
import { ForecastChart } from "./ForecastChart";

type Props = ComponentProps<typeof ForecastChart> & { staged: boolean; smooth: boolean };

interface Scene {
  seek: (progress: number, now?: boolean) => void;
  remeasure: () => void;
}

const SCENE = 6; // timeline seconds for the 24 hours of the gate day

const at = (minutes: number) => (minutes / 1440) * SCENE;
const clockText = (minutes: number) => `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** The day before delivery, bulletin by bulletin. With motion, it plays out as a pinned scene. */
export function Bulletins({ staged, smooth, ...chart }: Props) {
  const d = chart.decision;
  const section = useRef<HTMLElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const pin = useRef<ScrollTrigger>(undefined);
  const scene = useRef<Scene>(undefined);
  const cut = ukClock(d.cutoff);
  const used = ukClock(d.runs_used[0].publish_time);
  const day = ukDay(d.day);

  // One pin for as long as the layout is staged. A new day or gate only redraws the scene inside it, so the page never moves.
  useLayoutEffect(() => {
    const sec = section.current;
    if (!staged || !sec) return;
    registerGsap();
    const ctx = gsap.context(() => {
      const trigger = ScrollTrigger.create({
        trigger: sec,
        start: "top top",
        end: () => `+=${Math.round(window.innerHeight * 2.6)}`,
        pin: true,
        pinType: smooth ? "transform" : "fixed",
        anticipatePin: 1,
        onUpdate: (self) => scene.current?.seek(self.progress),
        onRefresh: () => scene.current?.remeasure(),
      });
      pin.current = trigger;
      setScene(trigger);
    }, sec);
    ScrollTrigger.sort();
    ScrollTrigger.refresh();
    if (pin.current) scene.current?.seek(pin.current.progress, true);

    // Hidden chart controls are out of the tab order, so tabbing across the scene would skip the chart, and tabbing
    // onto a control mid-fade would focus a faint one. Either way, the keyboard opens the scene at the chart.
    const onFocus = (e: FocusEvent) => {
      const to = e.target;
      const from = e.relatedTarget;
      const trigger = pin.current;
      if (!(to instanceof HTMLElement) || !to.matches(":focus-visible") || !trigger) return;
      const before = (n: Node) => Boolean(n.compareDocumentPosition(sec) & Node.DOCUMENT_POSITION_FOLLOWING);
      const forward = from instanceof Node && !sec.contains(from) ? before(from) : undefined;
      const crossed = forward !== undefined && !sec.contains(to) && forward !== before(to);
      if (!crossed && !(sec.contains(to) && trigger.progress < 1)) return;
      scrollToY(trigger.end, false);
      scene.current?.seek(1, true);
      if (!crossed) return;
      const stops = [...sec.querySelectorAll<HTMLElement>("#chart button, #chart [tabindex='0'], #chart summary")];
      stops.at(forward ? 0 : -1)?.focus({ preventScroll: true });
    };
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("focusin", onFocus);
      setScene(undefined);
      pin.current = undefined;
      ctx.revert();
    };
  }, [staged, smooth]);

  useLayoutEffect(() => {
    const sec = section.current;
    const clockEl = clock.current;
    const clockNode = clockEl?.firstChild;
    if (!staged || !sec || !clockEl || !clockNode) return;
    registerGsap();
    const $ = <T extends Element>(sel: string) => sec.querySelector<T>(sel) as T;
    const $$ = (sel: string) => [...sec.querySelectorAll<HTMLElement>(sel)];
    let scrub: gsap.core.Tween | undefined;
    const ctx = gsap.context(() => {
      const main = $<HTMLElement>(".stage-main");
      const frame = $<HTMLElement>(".frame");
      const shutter = $<HTMLElement>(".shutter");
      const captions = $$(".captions li");
      const runs = $$(".run");
      const gateT = at(minutesOf(d.cutoff));
      const morph = Math.max(SCENE, ...runs.map((r) => at(Number(r.dataset.t)) + 0.4)) + 0.3;
      const end = morph + 2.6;
      // The chart frame opens out of the shutter's box. The shutter's parent holds that box unscaled, whatever scaleY it is at when measured.
      const behind = $<HTMLElement>(".behind");
      const inset = () => {
        const a = main.getBoundingClientRect();
        const b = behind.getBoundingClientRect();
        return `inset(${b.top - a.top}px ${a.right - b.right}px ${a.bottom - b.bottom}px ${b.left - a.left}px)`;
      };
      const phase = (t: number) => (t < gateT ? 0 : t < gateT + 0.7 ? 1 : t < morph + 0.6 ? 2 : 3);
      let shown = -1;
      // The clock and caption read the timeline itself, so they match what is drawn even while the scrub catches up.
      const draw = () => {
        const t = tl.time();
        clockNode.nodeValue = t >= morph ? cut : clockText(Math.min(1440, Math.round((t / SCENE) * 288) * 5));
        const p = phase(t);
        if (p === shown) return;
        shown = p;
        captions.forEach((c, i) => c.classList.toggle("is-on", i === p));
      };
      const tl = gsap.timeline({ paused: true, defaults: { ease: "none" }, onUpdate: draw });
      tl.to({}, { duration: end }, 0);
      runs.forEach((row) => {
        const t = at(Number(row.dataset.t));
        tl.fromTo(row.querySelector(".run-in"), { autoAlpha: 0, x: -28 }, { autoAlpha: 1, x: 0, duration: 0.3, ease: "power2.out" }, t)
          .fromTo(row.querySelectorAll(".ch"), { opacity: 0 }, { opacity: 1, duration: 0.02, stagger: 0.035 }, t + 0.08)
          .fromTo(row.querySelector(".run-spark path"), { strokeDasharray: "1 1", strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.35, ease: "power1.inOut" }, t + 0.05);
      });
      tl.fromTo(".gate-row", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.15 }, gateT)
        .fromTo(".gate-rule", { scaleX: 0 }, { scaleX: 1, duration: 0.3, ease: "power2.out" }, gateT)
        .fromTo(shutter, { scaleY: 0 }, { scaleY: 1, duration: 0.45, ease: "power2.inOut" }, gateT + 0.1)
        .fromTo(frame, { autoAlpha: 0, clipPath: inset }, { autoAlpha: 1, duration: 0.01 }, morph)
        .to(frame, { clipPath: "inset(0px 0px 0px 0px)", duration: 1.2, ease: "power3.inOut" }, morph)
        .fromTo(".log", { opacity: 1 }, { opacity: 0.08, duration: 0.9 }, morph)
        .fromTo(".frame-slats", { opacity: 1 }, { opacity: 0, duration: 0.7 }, morph + 0.6)
        // autoAlpha, so a control can only take focus once it can be seen.
        .fromTo(frame.querySelectorAll(".frame-head, .plot-hint, .table-view"), { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.08, ease: "power2.out" }, morph + 0.9)
        .fromTo(frame.querySelector(".plot"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, morph + 0.9)
        .fromTo(frame.querySelectorAll(".ln-a, .ln-f"), { strokeDasharray: "1 1", strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.9, stagger: 0.15, ease: "power1.inOut" }, morph + 0.9)
        .fromTo(frame.querySelectorAll(".gap, .cross, .axis, .tip"), { opacity: 0 }, { opacity: 1, duration: 0.4 }, morph + 1.6);
      scene.current = {
        seek: (progress, now = false) => {
          scrub?.kill();
          if (now) tl.progress(progress);
          else scrub = gsap.to(tl, { progress, duration: 0.7, ease: "power3" });
        },
        // A resize moves the shutter, so the frame's opening clip is measured again.
        remeasure: () => {
          const p = tl.progress();
          tl.progress(0).invalidate().progress(p);
        },
      };
      tl.progress(pin.current?.progress ?? 0);
      draw();
    }, sec);
    return () => {
      scrub?.kill();
      scene.current = undefined;
      ctx.revert();
      clockNode.nodeValue = clockEl.dataset.clock ?? cut;
    };
  }, [staged, d, cut]);

  return (
    <section className={`bulletins${staged ? " is-staged" : ""}`} id="bulletins" aria-labelledby="bulletins-title" ref={section}>
      <div className="stage">
        <div className="stage-side">
          <p className="eyebrow">The bulletin log</p>
          <h2 id="bulletins-title" className="display">
            {ukDay(d.cutoff)}, bulletin by bulletin.
          </h2>
          <p className="clock" aria-hidden="true">
            <span ref={clock} data-clock={cut}>
              {cut}
            </span>
            <small>{ukTime(d.cutoff).slice(6)}</small>
          </p>
          <ol className="captions">
            <li>
              Runs of the national wind forecast arrive at fixed hours. Each one rewrites the whole delivery day. Shown: each run's {d.hours.length}-hour mean for {day}.
            </li>
            <li>
              {ukTime(d.cutoff)}, the gate shuts. The {used} run is the last one you could read.
            </li>
            <li>Later runs still arrive. You can read them now; at the gate you could not use them.</li>
            <li>{day}: the forecast you had, against what the wind did.</li>
          </ol>
        </div>
        <div className="stage-main">
          <BulletinLog decision={d} />
          <ForecastChart {...chart} />
        </div>
      </div>
    </section>
  );
}
