import Link from "next/link";

export default function Forbidden() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-3 px-4 py-20">
      <h1 className="font-display text-3xl font-bold">You don&apos;t have access to this page</h1>
      <p className="text-muted-foreground">This area is for a different kind of account. If you think that&apos;s a mistake, contact GuroMart support.</p>
      <Link href="/" className="font-semibold text-primary hover:underline">Go to the homepage</Link>
    </div>
  );
}
