"use client";

import Link, { useLinkStatus } from "next/link";
import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

function PendingHint() {
  const { pending } = useLinkStatus();
  return <span role="status" className={pending ? "absolute right-0 top-0 rounded-full bg-surface p-1 text-primary shadow-sm" : "sr-only"}>
    {pending ? <><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /><span className="sr-only">Opening resources…</span></> : null}
  </span>;
}

export function ResourceCategoryLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return <Link href={href} aria-label={label} className="relative">{children}<PendingHint /></Link>;
}
