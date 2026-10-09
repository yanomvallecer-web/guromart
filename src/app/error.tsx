"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-3 px-4 py-20">
      <h1 className="font-display text-3xl font-bold">Something went wrong</h1>
      <p className="text-muted-foreground">We couldn&apos;t load this page. Please try again in a moment.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
