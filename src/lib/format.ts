const php = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 });

/** Formats integer centavos as pesos, e.g. 15000 -> "₱150.00". Zero is "Free". */
export function formatPrice(centavos: number): string {
  if (!Number.isInteger(centavos) || centavos < 0) throw new RangeError(`Invalid price: ${centavos}`);
  if (centavos === 0) return "Free";
  return php.format(centavos / 100);
}

/** Turns a shop or product name into a URL slug. */
export function slugify(input: string, maxLength = 50): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}
