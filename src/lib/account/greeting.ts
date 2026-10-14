/** "Magandang umaga" and so on, by the clock in the Philippines. */
export function greeting(now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat("en-PH", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Manila" }).format(now));
  if (hour < 12) return "Magandang umaga";
  if (hour < 18) return "Magandang hapon";
  return "Magandang gabi";
}

/** The first word of a display name, for a friendly greeting; the whole name when it has no spaces. */
export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || "Teacher";
}
