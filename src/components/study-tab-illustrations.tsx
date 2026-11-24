export function BookFlip() {
  return <span className="study-tab-illustration tab-book" aria-hidden="true">
    <span className="tab-book-cover" />
    <span className="tab-book-pages" />
    <span className="tab-book-page" />
  </span>;
}

export function GrowingSprout() {
  return <span className="study-tab-illustration tab-sprout" aria-hidden="true">
    <span className="tab-sprout-soil" />
    <span className="tab-sprout-shoot">
      <span className="tab-sprout-stem" />
      <span className="tab-sprout-leaf left" />
      <span className="tab-sprout-leaf right" />
    </span>
  </span>;
}

export function GiftOpening() {
  return <span className="study-tab-illustration tab-gift" aria-hidden="true">
    <span className="tab-gift-box" />
    <span className="tab-gift-sparks" />
    <span className="tab-gift-lid" />
  </span>;
}
