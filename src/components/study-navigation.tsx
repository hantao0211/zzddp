"use client";

import { createContext, useContext } from "react";
import type { StudyPage } from "./study-shell";

export type StudyNavigation = {
  page: StudyPage;
  date: string;
  navigate: (page: StudyPage, replace?: boolean) => void;
  setDate: (date: string) => void;
  setReadingLogId: (id: string) => void;
};

export const StudyNavigationContext = createContext<StudyNavigation | null>(null);
export const useStudyNavigation = () => useContext(StudyNavigationContext);
