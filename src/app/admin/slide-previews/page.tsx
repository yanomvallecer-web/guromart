import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageShell, PanelSkeleton } from "@/components/layout/page-shell";
import { listingsNeedingSlides } from "@/lib/admin/slide-previews";
import { requireArea } from "@/lib/auth/dal";
import { SlideBackfill } from "./slide-backfill";

export const metadata: Metadata = { title: "Slide previews", robots: { index: false } };

export default function SlidePreviewsPage() {
  return (
    <PageShell
      title="Slide previews"
      description="Listings with a PowerPoint and room for more previews. Your browser draws their slides and adds them after the existing cover."
      actions={<Link href="/admin" className="text-sm font-semibold text-primary hover:underline">Admin overview</Link>}
    >
      <Suspense fallback={<PanelSkeleton />}>
        <Backfill />
      </Suspense>
    </PageShell>
  );
}

async function Backfill() {
  await requireArea("admin", "/admin/slide-previews");
  return <SlideBackfill items={await listingsNeedingSlides()} />;
}
