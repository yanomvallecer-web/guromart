import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/form";
import { paymentMethodsSentence } from "@/lib/payments/paymongo";
import { getSellerPlans } from "@/lib/platform-settings";
import { CONTACT_EMAIL } from "@/lib/site";

const link = "font-semibold text-primary hover:underline";

/** Written answers to common questions, shown while the AI helper is switched off. Fees and payout rules come from live settings. */
export async function HelpFaq() {
  const plans = await getSellerPlans();
  const fee = plans.starterBps / 100;
  const items: { q: string; a: React.ReactNode }[] = [
    {
      q: "How do I pay, and where do my files go?",
      a: (
        <>
          You pay through PayMongo with {paymentMethodsSentence()}. Once PayMongo confirms the payment, the resource appears in{" "}
          <Link href="/library" className={link}>My library</Link>, where you can download it again any time. Order numbers are under{" "}
          <Link href="/orders" className={link}>Orders</Link>.
        </>
      ),
    },
    {
      q: "Can I get a refund?",
      a: (
        <>
          Yes, if the file is broken or won&apos;t open, is clearly different from its description, you were charged twice, or it never reached
          your Library. Email <a href={`mailto:${CONTACT_EMAIL}`} className={link}>{CONTACT_EMAIL}</a> within 7 days with your order number
          (it starts with GM-). Changing your mind after downloading isn&apos;t covered. Full details are in the{" "}
          <Link href="/refunds" className={link}>refund policy</Link>.
        </>
      ),
    },
    {
      q: "Can I share a resource with other teachers?",
      a: "Only as far as its license allows: One teacher (your own classes), Several teachers (colleagues at your school) or Whole school. Reselling or uploading it elsewhere isn't allowed.",
    },
    {
      q: "How do I ask a seller a question?",
      a: (
        <>
          Tap &ldquo;Message the seller&rdquo; on the resource or shop page. Your chats are in <Link href="/messages" className={link}>Messages</Link>.
          Always pay through GuroMart checkout, never directly to a seller.
        </>
      ),
    },
    {
      q: "How do I start selling?",
      a: (
        <>
          Open a shop from <Link href="/sell" className={link}>Sell on GuroMart</Link>, verify your identity, add payout details and upload your
          first resource. Every listing is reviewed before buyers see it. Only sell work you made or have the right to sell.
        </>
      ),
    },
    {
      q: "What does GuroMart keep, and when am I paid?",
      a: `Selling is free with no monthly fee. GuroMart keeps ${fee}% of each sale and you keep ${100 - fee}%. New earnings are held ${plans.holdDays} days to cover refunds, then you can be paid to GCash, Maya or a bank account once your balance reaches ₱${plans.minPayoutCentavos / 100}.`,
    },
  ];
  return (
    <div className="flex flex-col gap-4" data-testid="help-faq">
      <Card className="p-4">
        <form action="/browse" className="flex flex-col gap-2">
          <Label htmlFor="help-search">Looking for a resource?</Label>
          <div className="flex gap-2">
            <Input id="help-search" name="q" placeholder="e.g. Grade 4 fractions worksheet" maxLength={120} className="h-11 flex-1" />
            <Button type="submit" className="h-11" aria-label="Search resources">
              <Search aria-hidden /> <span className="hidden sm:inline">Search</span>
            </Button>
          </div>
        </form>
      </Card>
      <Card className="divide-y divide-border overflow-hidden">
        {items.map((item) => (
          <details key={item.q} className="group px-4 py-3">
            <summary className="cursor-pointer list-none py-1 font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
              <span className="flex items-center justify-between gap-3">
                {item.q}
                <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-45">+</span>
              </span>
            </summary>
            <p className="pt-2 text-[15px] text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </Card>
      <p className="text-sm text-muted-foreground">
        Still stuck? Email <a href={`mailto:${CONTACT_EMAIL}`} className={link}>{CONTACT_EMAIL}</a> or see the{" "}
        <Link href="/terms" className={link}>terms</Link>.
      </p>
    </div>
  );
}
