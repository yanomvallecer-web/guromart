import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Logo } from "./logo";

/** Keep the phone's brand and account link in the first stream, even while identity loads. */
export function TeacherPhoneHeader({ greeting, initial }: { greeting: ReactNode; initial: ReactNode }) {
  return (
    <header className="teacher-phone-header">
      <div>
        <Logo showWordmark />
        <h1><Suspense fallback={<span aria-hidden>&nbsp;</span>}>{greeting}</Suspense></h1>
      </div>
      <Link href="/account" aria-label="Your account" className="teacher-avatar">
        <Suspense fallback={null}>{initial}</Suspense>
      </Link>
    </header>
  );
}
