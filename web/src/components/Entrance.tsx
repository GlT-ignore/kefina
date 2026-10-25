import { useLayoutEffect } from "react";

import { EASE, gsap, MASK_PAD, registerGsap, SplitText } from "../motion";

const SKIP = ["wheel", "touchstart", "pointerdown", "keydown"];

/**
 * Once per session a tuning scale sweeps in before the page; any input fast-forwards it.
 * The head script decides whether it plays (the "intro" class) and CSS hides it after 3.4 s if this never runs.
 */
export function Entrance({ motion }: { motion: boolean }) {
  useLayoutEffect(() => {
    if (!motion) return;
    registerGsap();
    const root = document.documentElement;
    const intro = root.classList.contains("intro");
    const covered = [...document.querySelectorAll<HTMLElement>("main, footer, .dock, .head")];
    const open = () => {
      root.classList.remove("intro");
      covered.forEach((el) => (el.inert = false));
    };
    let skip: (() => void) | undefined;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: EASE } });
      if (intro) {
        covered.forEach((el) => (el.inert = true));
        try {
          sessionStorage.setItem("readback-intro", "1");
        } catch {
          // Private mode can refuse storage; the entrance then plays again next visit.
        }
        tl.fromTo(".tuning-scale", { scaleX: 0 }, { scaleX: 1, duration: 0.9, ease: "expo.inOut" }, 0)
          .fromTo(".tuning-needle", { xPercent: -2400 }, { xPercent: 0, duration: 1.2, ease: "expo.inOut" }, 0.2)
          .fromTo(".tuning-name", { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1 }, 0.5)
          .fromTo(".tuning-sub", { opacity: 0 }, { opacity: 1, duration: 0.6 }, 0.8)
          .to(".tuning", { autoAlpha: 0, duration: 0.6, ease: "power2.inOut" }, 1.55)
          .add(open);
        skip = () => tl.timeScale(4);
        SKIP.forEach((e) => addEventListener(e, skip as () => void, { once: true, passive: true }));
      }
      const t0 = intro ? 1.5 : 0.1;
      const h1 = SplitText.create("#hero-title", { type: "lines", mask: "lines", linesClass: "split-line" });
      gsap.set(h1.masks, { ...MASK_PAD });
      tl.from(h1.lines, { yPercent: 120, duration: 1.4, stagger: 0.12 }, t0)
        .from(".hero .eyebrow, .provenance", { opacity: 0, y: 12, duration: 1 }, t0 + 0.1)
        .from(".hero .field", { opacity: 0, y: 24, duration: 1.2, stagger: 0.1 }, t0 + 0.25)
        .from(".readout", { opacity: 0, y: 24, duration: 1.2 }, t0 + 0.45);
    });
    return () => {
      SKIP.forEach((e) => skip && removeEventListener(e, skip));
      ctx.revert();
      open();
    };
  }, [motion]);

  return (
    <div className="tuning" aria-hidden="true">
      <div className="tuning-scale">
        <span className="tuning-needle" />
      </div>
      <p className="tuning-name">Readback</p>
      <p className="tuning-sub">GB wind, bulletin log</p>
    </div>
  );
}
