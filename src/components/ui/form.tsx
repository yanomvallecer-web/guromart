import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const field =
  "w-full rounded-[10px] border border-input bg-surface px-3 text-[15px] text-foreground placeholder:text-muted-foreground/80 focus-visible:border-primary aria-invalid:border-danger";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(field, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(field, "min-h-28 py-2.5", className)} {...props} />;
}

export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(field, "h-11 pr-8", className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-sm font-semibold text-foreground", className)} {...props} />;
}

export function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p id={id} className="text-sm text-danger">
      {messages[0]}
    </p>
  );
}

export function FormAlert({ tone = "danger", children }: { tone?: "danger" | "success"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "rounded-[10px] px-4 py-3 text-sm",
        tone === "danger" ? "bg-danger-soft text-danger" : "bg-success-soft text-success",
      )}
    >
      {children}
    </div>
  );
}
