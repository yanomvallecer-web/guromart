import { formatAmount } from "@/lib/format";

const label = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });
const dayLabel = (d: string) => label.format(new Date(`${d}T00:00:00Z`));

/** Daily sales as bars, one per day, with the amount on hover or focus. */
export function SalesChart({ daily }: { daily: { day: string; centavos: number; orders: number }[] }) {
  const max = Math.max(...daily.map((d) => d.centavos), 0);
  const total = daily.reduce((s, d) => s + d.centavos, 0);
  return (
    <figure className="flex flex-col gap-3" data-testid="sales-chart">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-display text-lg font-bold">Sales, last 30 days</span>
        <span className="text-sm text-muted-foreground">{formatAmount(total)} in total</span>
      </figcaption>
      {max === 0 ? (
        <p className="rounded-[12px] border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No paid sales in the last 30 days yet.
        </p>
      ) : (
        <div>
          <ol className="flex h-40 items-end gap-[2px] border-b border-border" aria-label="Sales per day">
            {daily.map((d) => (
              <li key={d.day} className="group relative flex h-full flex-1 items-end" tabIndex={0} aria-label={`${dayLabel(d.day)}: ${formatAmount(d.centavos)}, ${d.orders} ${d.orders === 1 ? "order" : "orders"}`}>
                <span
                  className="block w-full rounded-t-[4px] bg-primary transition-colors group-hover:bg-primary-hover group-focus:bg-primary-hover"
                  style={{ height: d.centavos ? `${Math.max((d.centavos / max) * 100, 3)}%` : 0 }}
                />
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-[8px] bg-foreground px-2 py-1 text-xs text-background shadow group-hover:block group-focus:block">
                  {dayLabel(d.day)} · {formatAmount(d.centavos)} · {d.orders} {d.orders === 1 ? "order" : "orders"}
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-1 flex justify-between text-xs text-muted-foreground">
            <span>{dayLabel(daily[0].day)}</span>
            <span>Today</span>
          </div>
        </div>
      )}
    </figure>
  );
}
