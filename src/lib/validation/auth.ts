import { z } from "zod";

export const emailSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")).pipe(z.string().max(254)),
});

export const otpSchema = emailSchema.extend({
  token: z.string().trim().regex(/^\d{6,8}$/, "Enter the code from your email."),
});
