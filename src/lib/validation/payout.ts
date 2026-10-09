import { z } from "zod";

export const PAYOUT_METHODS = [
  { value: "gcash", label: "GCash" },
  { value: "maya", label: "Maya" },
  { value: "bank", label: "Bank account" },
] as const;

export const VERIFICATION_KINDS = [
  { value: "government_id", label: "Government ID (UMID, PhilSys, passport, driver's license)" },
  { value: "prc_license", label: "PRC license" },
  { value: "school_id", label: "School employee ID" },
  { value: "business_registration", label: "DTI, SEC or CDA registration (for publishers)" },
] as const;

export const verificationKind = z.enum(["government_id", "prc_license", "school_id", "business_registration"]);

/** Payout details as the seller enters them. Numbers are stored as digits only. */
export const payoutSchema = z
  .object({
    method: z.enum(["gcash", "maya", "bank"], "Choose how you want to be paid."),
    account_name: z.string().trim().min(2, "Enter the name on the account.").max(160, "Keep the name under 160 characters."),
    account_number: z.string().transform((v) => v.replace(/[\s-]/g, "")),
    bank_name: z
      .string()
      .trim()
      .max(120, "Keep the bank name under 120 characters.")
      .transform((v) => (v === "" ? null : v)),
  })
  .superRefine((v, ctx) => {
    if (v.method === "bank") {
      if (!/^\d{6,34}$/.test(v.account_number)) ctx.addIssue({ code: "custom", path: ["account_number"], message: "Enter the account number using digits only." });
      if (!v.bank_name) ctx.addIssue({ code: "custom", path: ["bank_name"], message: "Enter the bank's name." });
    } else if (!/^09\d{9}$/.test(v.account_number)) {
      ctx.addIssue({ code: "custom", path: ["account_number"], message: "Enter the 11-digit mobile number, like 0917 123 4567." });
    }
  })
  .transform((v) => ({ ...v, bank_name: v.method === "bank" ? v.bank_name : null }));

/** Shows only the last four digits, e.g. "•••• 4567". */
export function maskAccount(number: string): string {
  const digits = number.replace(/\D/g, "");
  return `•••• ${digits.slice(-4)}`;
}
