import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { Prose } from "@/components/layout/prose";
import { CONTACT_EMAIL, POLICY_UPDATED } from "@/lib/site";

export const metadata: Metadata = {
  title: "Delete your data",
  description: "How to delete your GuroMart account and the personal information we hold about you.",
};

export default function DataDeletionPage() {
  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Delete my GuroMart account")}`;
  return (
    <PageShell title="Delete your data" description={`Last updated ${POLICY_UPDATED}`}>
      <Prose>
        <p>You can ask GuroMart to delete your account and the personal information we hold about you at any time.</p>

        <h2>How to ask</h2>
        <ol>
          <li>
            Email <a href={mailto}>{CONTACT_EMAIL}</a> with the subject &ldquo;Delete my GuroMart account&rdquo;.
          </li>
          <li>
            Send it from the email address on your GuroMart account. If you signed in with Facebook, use the email address on your Facebook
            account, or tell us the name on your Facebook profile.
          </li>
          <li>We reply to confirm we received it, and we finish the deletion within 30 days.</li>
        </ol>

        <h2>If you signed in with Facebook</h2>
        <p>
          You can also stop GuroMart from receiving anything more from Facebook. On Facebook, go to <strong>Settings &amp; privacy &gt; Settings &gt;
          Apps and websites</strong>, find GuroMart, and click <strong>Remove</strong>. This disconnects GuroMart from your Facebook account. To also
          delete what GuroMart already holds, send the email above.
        </p>

        <h2>What we delete</h2>
        <ul>
          <li>Your name, email address, profile picture and sign-in connections.</li>
          <li>Your cart, wishlist, reviews and notifications.</li>
          <li>If you sell: your ID documents, payout details, shop and listings.</li>
        </ul>

        <h2>What we keep</h2>
        <p>
          We keep records of completed orders, payments and seller payouts, without your name or email, for as long as tax and accounting rules
          require.
        </p>

        <p>
          Read our <Link href="/privacy">privacy policy</Link> for more on what we collect and why.
        </p>
      </Prose>
    </PageShell>
  );
}
