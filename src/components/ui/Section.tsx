// Sidebar section with the reference's small uppercase heading.

import type { ReactNode } from "react";
import { SoonBadge } from "./Button";

type SectionProps = Readonly<{
  title: string;
  /** Marks the whole section as planned for a later milestone. */
  soon?: boolean;
  children: ReactNode;
}>;

/** Titled block separated by a bottom border; `soon` adds a badge and blocks interaction. */
export function Section({ title, soon, children }: SectionProps) {
  return (
    <section className="border-b border-line px-4 py-4">
      <h2 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
        {title}
        {soon && <SoonBadge />}
      </h2>
      <fieldset
        disabled={soon}
        className="space-y-2.5 disabled:cursor-not-allowed disabled:opacity-55"
      >
        {children}
      </fieldset>
    </section>
  );
}
