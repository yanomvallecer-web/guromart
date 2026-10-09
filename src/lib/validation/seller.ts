import { z } from "zod";

export const SELLER_TYPES = [
  { value: "teacher", label: "Teacher", hint: "You make materials for your own classes and share them." },
  { value: "creator", label: "Independent creator", hint: "Tutors, homeschool educators and content creators." },
  { value: "publisher", label: "Publisher", hint: "A registered business with a catalog of titles." },
  { value: "school_supplier", label: "School supplier", hint: "Printables and supplies for classrooms." },
  { value: "institution", label: "School or institution", hint: "A school sharing its own materials." },
] as const;

export const startSellingSchema = z.object({
  seller_type: z.enum(SELLER_TYPES.map((t) => t.value) as [string, ...string[]], { error: "Choose what kind of seller you are." }),
  store_name: z.string().trim().min(2, "Enter at least 2 characters.").max(80, "Keep this under 80 characters."),
  store_slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/, "Use 3 to 50 lowercase letters, numbers and dashes."),
  agree: z.literal("on", { error: "Accept the seller terms to continue." }),
});
