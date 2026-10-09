"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-checks the order every few seconds for up to two minutes while PayMongo confirms the payment. */
export function RefreshWhilePending() {
  const router = useRouter();
  useEffect(() => {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (tries > 40) clearInterval(timer);
      else router.refresh();
    }, 3000);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
