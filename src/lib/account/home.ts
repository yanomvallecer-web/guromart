import "server-only";
import { createClient } from "@/lib/supabase/server";

export type QuarterCoverage = { code: string; name: string; sequence: number; owned: number }[];

type CoverageRow = {
  subjects: { code: string } | null;
  academic_periods: { code: string; period_kind: string; sequence: number | null } | null;
  product_grade_levels: { grade_levels: { code: string } | null }[];
};

/**
 * How many resources the teacher owns for each quarter, counting only those
 * for the grade and subject given (either may be null for any). Read under
 * row-level security, so resources no longer sold aren't counted.
 */
export async function getQuarterCoverage(
  productIds: string[],
  quarters: { code: string; name: string }[],
  filter: { grade: string | null; subject: string | null },
): Promise<QuarterCoverage> {
  const owned = new Map<string, number>();
  if (productIds.length) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("products")
      .select("subjects(code), academic_periods(code, period_kind, sequence), product_grade_levels(grade_levels(code))")
      .in("id", productIds);
    if (error) throw new Error(`Could not load your library: ${error.message}`);
    for (const r of data as unknown as CoverageRow[]) {
      if (r.academic_periods?.period_kind !== "quarter") continue;
      if (filter.subject && r.subjects?.code !== filter.subject) continue;
      if (filter.grade && !r.product_grade_levels.some((g) => g.grade_levels?.code === filter.grade)) continue;
      owned.set(r.academic_periods.code, (owned.get(r.academic_periods.code) ?? 0) + 1);
    }
  }
  return quarters.map((q, i) => ({ code: q.code, name: q.name, sequence: i + 1, owned: owned.get(q.code) ?? 0 }));
}
