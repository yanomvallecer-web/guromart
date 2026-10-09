import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .transform((v) => (v === "" ? null : v));

export const profileSchema = z.object({
  display_name: z.string().trim().min(2, "Enter at least 2 characters.").max(80, "Keep this under 80 characters."),
  school_name: optionalText(160),
  region: optionalText(80),
});

export type ProfileInput = z.infer<typeof profileSchema>;
