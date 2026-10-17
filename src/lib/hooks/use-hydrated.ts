"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False on the server and during hydration, true once the page's JavaScript
 * runs. Lets a component render a working no-JavaScript version first and
 * swap in controls that need scripts (Share, code boxes) only when they work.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
