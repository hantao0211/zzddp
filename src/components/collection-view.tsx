"use client";

import { LayoutGrid, List } from "lucide-react";
import { useEffect, useState } from "react";

type View = "list" | "grid";

export function useCollectionView(collection: "shelf" | "activities" | "shop", viewerId: string | undefined, initial: View) {
  const key = viewerId ? `xiaobu-${collection}-view:${viewerId}` : null;
  const [view, setView] = useState<View>(initial);
  useEffect(() => {
    try {
      const saved = key && localStorage.getItem(key);
      setView(saved === "list" || saved === "grid" ? saved : initial);
    } catch { setView(initial); }
  }, [key, initial]);

  function choose(next: View) {
    setView(next);
    try { if (key) localStorage.setItem(key, next); } catch { /* Keep the selection for this visit. */ }
  }
  return {view, choose};
}

export function CollectionViewSwitch({label, view, choose}: {label: string; view: View; choose: (view: View) => void}) {
  return <div className="shelf-view-switch" role="group" aria-label={label}>
    <button type="button" aria-label="列表视图" title="列表视图" aria-pressed={view === "list"} onClick={() => choose("list")}><List size={18} aria-hidden="true"/></button>
    <button type="button" aria-label="方块视图" title="方块视图" aria-pressed={view === "grid"} onClick={() => choose("grid")}><LayoutGrid size={17} aria-hidden="true"/></button>
  </div>;
}
