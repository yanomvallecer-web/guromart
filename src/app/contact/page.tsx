import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { Prose } from "@/components/layout/prose";
import { BUSINESS_LOCATION, CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact us",
  description: "How to reach GuroMart for help with orders, refunds, selling and privacy.",
};

export default function ContactPage() {
  return (
    <PageShell title="Contact us" description="We're happy to help with orders, refunds and selling.">
      <Prose>
        <h2>Email</h2>
        <p>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
        <p>We reply within 3 working days. For an order, include its number (it starts with GM-) so we can find it quickly.</p>

        {BUSINESS_LOCATION ? (
          <>
            <h2>Address</h2>
            <p>{BUSINESS_LOCATION}</p>
          </>
        ) : null}

        <h2>Common questions</h2>
        <ul>
          <li>
            Where are my purchases? In your <Link href="/library">Library</Link>, as soon as payment is confirmed.
          </li>
          <li>
            Something wrong with a file? See the <Link href="/refunds">refund policy</Link>.
          </li>
          <li>
            Want to sell? Start at <Link href="/sell">Sell on GuroMart</Link>.
          </li>
          <li>
            Your data: see the <Link href="/privacy">privacy policy</Link> or <Link href="/data-deletion">delete your data</Link>.
          </li>
        </ul>
      </Prose>
    </PageShell>
  );
}
