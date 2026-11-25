"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { LearningApp } from "./learning-app";
import { ReadingApp } from "./reading-app";
import { StudyAssistant } from "./study-assistant";
import { StudyNavigationContext } from "./study-navigation";
import type { StudyPage } from "./study-shell";

function locationPage(): StudyPage {
  if (location.pathname !== "/reading/") return "home";
  const view = new URLSearchParams(location.search).get("view");
  return view === "growth" || view === "mall" || view === "manage" ? view : "reading";
}

/** Keep the learning spaces alive: menu clicks never reload the document or discard drafts. */
export function StudyWorkspace({ initialPage }: { initialPage: "home" | "reading" }) {
  const [page, setPage] = useState<StudyPage>(initialPage);
  const [date, setDate] = useState("");
  const [ready, setReady] = useState(false);
  const [preloaded, setPreloaded] = useState(false);
  const [session, setSession] = useState(0);
  const [demoMode,setDemoMode]=useState(false);
  const [readingLogId, setReadingLogId] = useState<string>();

  useEffect(() => {
    const update = () => {
      setPage(locationPage());
      const value = new URLSearchParams(location.search).get("studyDate");
      setDate(value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "");
    };
    update(); setReady(true);
    // Warm the other space after the first paint, without waiting for a menu click.
    const warm = window.setTimeout(() => setPreloaded(true), 250);
    const reset = () => { setSession(v => v + 1); setReadingLogId(undefined); };
    window.addEventListener("popstate", update);
    window.addEventListener("xiaobu:session-changed", reset);
    return () => { clearTimeout(warm); window.removeEventListener("popstate", update); window.removeEventListener("xiaobu:session-changed", reset); };
  }, []);

  const navigate = useCallback((next: StudyPage, replace = false) => {
    const url = new URL(location.href);
    url.pathname = next === "home" ? "/" : "/reading/";
    url.searchParams.delete("view");
    if (next === "growth" || next === "mall" || next === "manage") url.searchParams.set("view", next);
    if (date) url.searchParams.set("studyDate", date);
    if (url.href !== location.href) window.history[replace ? "replaceState" : "pushState"](null, "", url);
    setPreloaded(true);
    setPage(next);
    window.scrollTo({ top: 0, behavior: "instant" });
    if (next === "home") window.dispatchEvent(new Event("xiaobu:home-home"));
  }, [date]);
  const navigation = useMemo(() => ({ page, date, navigate, setDate, setReadingLogId }), [page, date, navigate]);

  function followStudyLink(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
    if (!link || link.target || link.hasAttribute("download")) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || (url.pathname !== "/" && url.pathname !== "/reading/") || url.hash) return;
    event.preventDefault();
    const view = url.searchParams.get("view");
    navigate(url.pathname === "/" ? "home" : view === "growth" || view === "mall" || view === "manage" ? view : "reading");
  }

  return <StudyNavigationContext.Provider value={navigation}>
    <div key={session} onClick={followStudyLink}>
      {(initialPage === "home" || preloaded || page === "home") && <div data-study-pane="" hidden={page !== "home"}><LearningApp active={page === "home"} onDemoModeChange={setDemoMode} /></div>}
      {(initialPage === "reading" || preloaded || page !== "home") && <div data-study-pane="" hidden={page === "home"}><ReadingApp active={page !== "home"} /></div>}
      {ready && <StudyAssistant studyDate={date || undefined} navigationManaged={!demoMode} readingMode={page !== "home"} readingLogId={readingLogId} />}
    </div>
  </StudyNavigationContext.Provider>;
}
