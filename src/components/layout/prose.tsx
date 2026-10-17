import type { ReactNode } from "react";

/** Long-form text pages such as the privacy policy. */
export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-[72ch] text-[15px] leading-7 [&_a]:font-semibold [&_a]:text-primary [&_a:hover]:underline [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
      {children}
    </div>
  );
}
