import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-foreground no-underline" aria-label="GuroMart home">
      <span className="flex size-9 items-center justify-center rounded-[10px] bg-primary font-display text-xl font-extrabold text-white">
        G
      </span>
      <span className="font-display text-[22px] font-extrabold tracking-tight">GuroMart</span>
    </Link>
  );
}
