import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { Prose } from "@/components/layout/prose";
import { CONTACT_EMAIL, POLICY_UPDATED } from "@/lib/site";

export const metadata: Metadata = {
  title: "Return and refund policy",
  description: "When you can get your money back for a resource bought on GuroMart, and how to ask.",
};

export default function RefundsPage() {
  return (
    <PageShell title="Return and refund policy" description={`Last updated ${POLICY_UPDATED}`}>
      <Prose>
        <p>
          Resources on GuroMart are digital files, so they can&apos;t be returned like a physical item. Instead, we refund you when something
          is wrong with what you bought.
        </p>

        <h2>When you can get a refund</h2>
        <ul>
          <li>The file is broken, empty, or won&apos;t open.</li>
          <li>The resource is clearly different from its description or previews, for example the wrong grade level or subject.</li>
          <li>You were charged twice for the same order.</li>
          <li>You paid but the resource never appeared in your Library.</li>
          <li>The resource was removed because it copied someone else&apos;s work.</li>
        </ul>

        <h2>When we can&apos;t give a refund</h2>
        <ul>
          <li>You changed your mind after downloading a resource that matches its description.</li>
          <li>You bought a resource you already own from another source.</li>
        </ul>

        <h2>How to ask</h2>
        <p>
          Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> within 7 days of your purchase from the email address on your account.
          Include your order number (it starts with GM-, and you can find it under <Link href="/orders">Orders</Link>) and tell us what&apos;s
          wrong. A screenshot helps.
        </p>

        <h2>What happens next</h2>
        <ul>
          <li>We reply within 3 working days. We may ask the seller to fix the file first, if you prefer that.</li>
          <li>Approved refunds go back to the account you paid with, for example your GCash, Maya or bank account.</li>
          <li>Once refunded, the resource is removed from your Library.</li>
        </ul>

        <p>
          This policy doesn&apos;t limit your rights under Philippine consumer law. See also our <Link href="/terms">terms and conditions</Link>.
        </p>
      </Prose>
    </PageShell>
  );
}
