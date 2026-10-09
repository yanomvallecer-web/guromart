import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2 text-foreground no-underline" aria-label="GuroMart home">
      <span className="flex size-10 items-center md:size-9 justify-center rounded-[10px] bg-primary font-display text-xl font-extrabold text-white">
        G
      </span>
      <span className="hidden font-display text-[22px] font-extrabold tracking-tight md:inline">GuroMart</span>
    </Link>
  );
}
