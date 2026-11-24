"use client";

import { useEffect, useRef } from "react";

/** Each visible illustration plays on arrival, then occasionally while the reader stays. */
export function useIllustrationMotion<T extends Element = HTMLSpanElement>(
  onPlay?: (art: T) => () => void, minDelay = 3000, maxDelay = 6000,
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const art = ref.current;
    if (!art) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let inView = false;
    let stopPose: (() => void) | undefined;
    let firstPlay = true;
    let timer: number | undefined;

    function play() {
      if (!art || !inView || document.hidden || preference.matches) return;
      stopPose?.();
      stopPose = onPlay?.(art);
      if (onPlay) return;
      if (art.hasAttribute("data-playing")) {
        for (const animation of art.getAnimations({ subtree: true })) {
          if (!(animation instanceof CSSAnimation)) continue;
          animation.currentTime = 0;
          animation.play();
        }
      } else {
        art.setAttribute("data-playing", "");
      }
      firstPlay = false;
    }

    function schedule() {
      timer = window.setTimeout(() => {
        timer = undefined;
        if (!inView || document.hidden || preference.matches) return;
        play();
        schedule();
      }, minDelay + Math.random() * (maxDelay - minDelay));
    }

    function sync() {
      window.clearTimeout(timer);
      if (!inView || document.hidden || preference.matches) {
        stopPose?.();
        stopPose = undefined;
        art?.removeAttribute("data-playing");
        if (preference.matches) firstPlay = true;
        return;
      }
      if (firstPlay && !onPlay) play();
      schedule();
    }

    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting && entry.intersectionRatio >= 0.5;
      sync();
    }, { threshold: 0.5 });
    observer.observe(art);
    document.addEventListener("visibilitychange", sync);
    preference.addEventListener("change", sync);
    return () => {
      window.clearTimeout(timer);
      stopPose?.();
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      preference.removeEventListener("change", sync);
      art.removeAttribute("data-playing");
    };
  }, [onPlay, minDelay, maxDelay]);

  return ref;
}
