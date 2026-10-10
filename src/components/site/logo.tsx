import Link from "next/link";

const G_PATH =
  "M12.1 0.5Q9 0.5 6.5 -1Q4.1 -2.5 2.8 -5.3Q1.4 -8.2 1.4 -12.3Q1.4 -15.3 2.2 -17.7Q3 -20.2 4.5 -21.9Q6.1 -23.7 8.4 -24.7Q10.8 -25.6 13.9 -25.6Q16.4 -25.6 18.3 -25Q20.2 -24.4 21.6 -23.3Q22.9 -22.2 23.5 -20.7Q24.2 -19.2 24.1 -17.3L18.4 -16Q18.4 -17.6 17.8 -18.6Q17.2 -19.6 16.1 -20.1Q15.1 -20.6 13.7 -20.6Q11.8 -20.6 10.5 -19.7Q9.2 -18.8 8.5 -17Q7.9 -15.3 7.9 -12.6Q7.9 -10.6 8.2 -9Q8.6 -7.5 9.4 -6.5Q10.2 -5.4 11.4 -4.9Q12.5 -4.4 14 -4.4Q15.6 -4.4 16.7 -4.9Q17.8 -5.4 18.4 -6.3Q19 -7.3 19 -8.7H14.8V-13.1H24.9V-8.3V0H20.7L20.6 -6.5H20Q19.6 -4.2 18.6 -2.6Q17.6 -1.1 16 -0.3Q14.4 0.5 12.1 0.5Z";

/** The GuroMart mark: a shopping bag carrying the G. Source files live in the brand kit. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={className}>
      <path d="M35 38V27a15 15 0 0 1 30 0v11" fill="none" stroke="var(--foreground)" strokeWidth="7" strokeLinecap="round" />
      <path d="M22 36h56q5 0 5.5 5L87 84q.5 8-7 8H20q-7.5 0-7-8l3.5-43q.5-5 5.5-5Z" fill="var(--primary)" />
      <path transform="translate(36.8 78)" d={G_PATH} fill="#fff" />
      <path d="M66 43q1.3 4.7 6 6-4.7 1.3-6 6-1.3-4.7-6-6 4.7-1.3 6-6Z" fill="var(--accent)" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-1.5 text-foreground no-underline" aria-label="GuroMart home">
      <LogoMark className="size-10 md:size-9" />
      <span className="hidden font-display text-[22px] font-extrabold tracking-tight md:inline">
        Guro<span className="text-primary">Mart</span>
      </span>
    </Link>
  );
}
