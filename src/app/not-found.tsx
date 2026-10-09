import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-3 px-4 py-20">
      <h1 className="font-display text-3xl font-bold">We couldn&apos;t find that page</h1>
      <p className="text-muted-foreground">It may have moved, or the resource may no longer be available.</p>
      <Link href="/browse" className="font-semibold text-primary hover:underline">Browse resources</Link>
    </div>
  );
}
