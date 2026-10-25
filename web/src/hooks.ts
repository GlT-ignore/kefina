import { type RefObject, useCallback, useLayoutEffect, useState, useSyncExternalStore } from "react";

/** A media query, false on the server and during hydration so both renders match. */
export function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => matchMedia(query).matches, () => false);
}

export const useMotion = () => useMedia("(prefers-reduced-motion: no-preference)");

export interface Size {
  w: number;
  h: number;
}

/** Keeps the chosen item of a sideways scroller in view without moving the page. The scroller must be positioned, so item offsets are measured from it. */
export function useCentered(ref: RefObject<HTMLElement | null>, selector: string, key: string, smooth: boolean): void {
  useLayoutEffect(() => {
    let live = true;
    const center = () => {
      const el = ref.current;
      const item = el?.querySelector<HTMLElement>(selector);
      if (!live || !el || !item || el.scrollWidth <= el.clientWidth) return;
      el.scrollTo({ left: item.offsetLeft - el.clientWidth / 2 + item.offsetWidth / 2, behavior: smooth ? "smooth" : "auto" });
    };
    // Web fonts can change the items' widths after the first measure.
    const afterFonts = async () => {
      await document.fonts.ready;
      center();
    };
    center();
    void afterFonts();
    return () => {
      live = false;
    };
  }, [ref, selector, key, smooth]);
}

/** The element's rounded content size, starting from a fallback that the server render also uses. */
export function useSize(ref: RefObject<HTMLElement | null>, fallback: Size): Size {
  const [size, setSize] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      const h = Math.round(entry.contentRect.height);
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}
