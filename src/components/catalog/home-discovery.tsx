"use client";

import { useState, type ReactNode } from "react";
import { Search, SlidersHorizontal } from "lucide-react";

/** Only the phone filter disclosure needs client state; catalog links and search remain ordinary GET navigation. */
export function HomeDiscovery({ children, filters }: { children: ReactNode; filters: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="teacher-discovery" aria-label="Search and filter teaching resources">
      <div className="teacher-search-row">
        <form action="/browse" role="search" className="teacher-search-form">
          <Search aria-hidden className="teacher-search-icon" />
          <label htmlFor="teacher-search" className="sr-only">Search teaching resources</label>
          <input id="teacher-search" name="q" type="search" maxLength={120} placeholder="Search teaching resources" />
          {Object.entries(filters).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
          <button type="submit" aria-label="Search" className="teacher-search-submit"><Search aria-hidden className="size-5" /></button>
        </form>
        <button type="button" className="teacher-filter-toggle" aria-label={open ? "Hide lesson filters" : "Show lesson filters"} aria-expanded={open} aria-controls="teacher-home-filters" onClick={() => setOpen(!open)}>
          <SlidersHorizontal aria-hidden className="size-5" />
        </button>
      </div>
      <div id="teacher-home-filters" className={`teacher-filter-options${open ? " is-open" : ""}`}>{children}</div>
    </section>
  );
}
