import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

export function BackLabel({ children }: { children: ReactNode }) {
  return <span className="back-link-label"><ArrowLeft size={16} aria-hidden="true" />{children}</span>;
}
