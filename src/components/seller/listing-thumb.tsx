import { ImageOff } from "lucide-react";
import { publicObjectUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";

/** A listing's first preview image, or a clear "no preview yet" tile so the seller knows to add one. */
export function ListingThumb({ path, className }: { path: string | null; className?: string }) {
  return (
    <div className={cn("flex aspect-[4/3] shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-border bg-surface-muted", className)}>
      {path ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={publicObjectUrl("product-previews", path)} alt="" loading="lazy" className="size-full bg-surface object-cover object-top" />
      ) : (
        <span className="flex flex-col items-center gap-1 px-1 text-center text-[11px] font-medium leading-tight text-muted-foreground">
          <ImageOff className="size-5" aria-hidden />
          No preview yet
        </span>
      )}
    </div>
  );
}
