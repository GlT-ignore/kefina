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

const onResize = (onChange: () => void) => {
  addEventListener("resize", onChange);
  return () => removeEventListener("resize", onChange);
};

/**
 * The layout viewport's height, 0 on the server and during hydration so both renders match.
 * Unlike innerHeight it holds still while a phone's address bar slides in and out.
 */
export const useScreenHeight = () => useSyncExternalStore(onResize, () => document.documentElement.clientHeight, () => 0);

interface Size {
  w: number;
  h: number;
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
