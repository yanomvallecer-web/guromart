import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/** Plain GET form: works without JavaScript and keeps filters in the URL. */
export function SearchForm({ defaultValue, className, size = "md" }: { defaultValue?: string; className?: string; size?: "md" | "lg" }) {
  return (
    <form action="/browse" role="search" className={cn("flex min-w-0 overflow-hidden rounded-[12px] border-[1.5px] border-input bg-surface focus-within:border-primary", className)}>
      <label htmlFor={`q-${size}`} className="sr-only">
        Search teaching resources
      </label>
      <input
        id={`q-${size}`}
        name="q"
        type="search"
        defaultValue={defaultValue}
        maxLength={120}
        placeholder='Try "Grade 4 Science lesson plan"'
        className={cn("min-w-0 flex-1 bg-transparent px-3.5 text-foreground outline-none placeholder:text-muted-foreground", size === "lg" ? "h-14 text-base" : "h-11 text-[15px]")}
      />
      <button type="submit" aria-label="Search" className="flex items-center bg-primary px-4 text-white hover:bg-primary-hover">
        <Search className="size-5" />
      </button>
    </form>
  );
}
