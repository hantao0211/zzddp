"use client";

import { useIllustrationMotion } from "./use-illustration-motion";

export function BookFlip() {
  const ref = useIllustrationMotion();
  return <span ref={ref} className="study-tab-illustration tab-book" aria-hidden="true">
    <span className="tab-book-cover" />
    <span className="tab-book-pages" />
    <span className="tab-book-page" />
  </span>;
}

export function GrowingSprout() {
  const ref = useIllustrationMotion();
  return <span ref={ref} className="study-tab-illustration tab-sprout" aria-hidden="true">
    <span className="tab-sprout-soil" />
    <span className="tab-sprout-shoot">
      <span className="tab-sprout-stem" />
      <span className="tab-sprout-leaf left" />
      <span className="tab-sprout-leaf right" />
    </span>
  </span>;
}

export function GiftOpening() {
  const ref = useIllustrationMotion();
  return <span ref={ref} className="study-tab-illustration tab-gift" aria-hidden="true">
    <span className="tab-gift-box" />
    <span className="tab-gift-sparks" />
    <span className="tab-gift-lid" />
  </span>;
}
