import { describe, expect, it } from "vitest";
import { maskAccount, payoutSchema } from "./payout";

describe("payoutSchema", () => {
  it("accepts a GCash number with spaces and drops any bank name", () => {
    const r = payoutSchema.safeParse({ method: "gcash", account_name: "Liza Cruz", account_number: "0917 123 4567", bank_name: "BPI" });
    expect(r.success && r.data).toEqual({ method: "gcash", account_name: "Liza Cruz", account_number: "09171234567", bank_name: null });
  });

  it("rejects wallet numbers that aren't Philippine mobile numbers", () => {
    for (const n of ["12345678901", "0917123456", "+639171234567"]) {
      expect(payoutSchema.safeParse({ method: "maya", account_name: "Liza Cruz", account_number: n, bank_name: "" }).success).toBe(false);
    }
  });

  it("needs a bank name and a numeric account for banks", () => {
    expect(payoutSchema.safeParse({ method: "bank", account_name: "Liza Cruz", account_number: "1234-5678-90", bank_name: "" }).success).toBe(false);
    expect(payoutSchema.safeParse({ method: "bank", account_name: "Liza Cruz", account_number: "12AB5678", bank_name: "BDO" }).success).toBe(false);
    const ok = payoutSchema.safeParse({ method: "bank", account_name: "Liza Cruz", account_number: "1234-5678-90", bank_name: "BDO" });
    expect(ok.success && ok.data.account_number).toBe("1234567890");
  });

  it("masks all but the last four digits", () => {
    expect(maskAccount("09171234567")).toBe("•••• 4567");
  });
});
