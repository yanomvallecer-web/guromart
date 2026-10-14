import "server-only";
import { createClient } from "@/lib/supabase/server";

export type PeriodCoverage = { code: string; name: string; sequence: number; owned: number }[];

type CoverageRow = {
  subjects: { code: string } | null;
  academic_periods: { code: string } | null;
  product_grade_levels: { grade_levels: { code: string } | null }[];
};

/**
 * How many resources the teacher owns for each period given (quarters or
 * terms), counting only those
 * for the grade and subject given (either may be null for any). Read under
 * row-level security, so resources no longer sold aren't counted.
 */
export async function getPeriodCoverage(
  productIds: string[],
  periods: { code: string; name: string }[],
  filter: { grade: string | null; subject: string | null },
): Promise<PeriodCoverage> {
  const owned = new Map<string, number>();
  const wanted = new Set(periods.map((p) => p.code));
  if (productIds.length) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("products")
      .select("subjects(code), academic_periods(code), product_grade_levels(grade_levels(code))")
      .in("id", productIds);
    if (error) throw new Error(`Could not load your library: ${error.message}`);
    for (const r of data as unknown as CoverageRow[]) {
      if (!r.academic_periods || !wanted.has(r.academic_periods.code)) continue;
      if (filter.subject && r.subjects?.code !== filter.subject) continue;
      if (filter.grade && !r.product_grade_levels.some((g) => g.grade_levels?.code === filter.grade)) continue;
      owned.set(r.academic_periods.code, (owned.get(r.academic_periods.code) ?? 0) + 1);
    }
  }
  return periods.map((q, i) => ({ code: q.code, name: q.name, sequence: i + 1, owned: owned.get(q.code) ?? 0 }));
}
