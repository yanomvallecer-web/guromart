import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { Prose } from "@/components/layout/prose";
import { CONTACT_EMAIL, POLICY_UPDATED } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms and conditions",
  description: "The rules for buying and selling teaching resources on GuroMart.",
};

export default function TermsPage() {
  return (
    <PageShell title="Terms and conditions" description={`Last updated ${POLICY_UPDATED}`}>
      <Prose>
        <p>
          GuroMart is an online marketplace where Filipino teachers buy and sell digital teaching resources such as lesson plans, worksheets
          and slides. By creating an account or buying on GuroMart you agree to these terms. GuroMart is an independent marketplace and is
          not the official DepEd website.
        </p>

        <h2>Your account</h2>
        <ul>
          <li>You must be at least 18 years old to create an account.</li>
          <li>Give accurate information and keep your sign-in details to yourself. You are responsible for what happens under your account.</li>
          <li>We may suspend accounts that break these terms, for example by sharing paid files, uploading copied content or committing fraud.</li>
        </ul>

        <h2>Buying</h2>
        <ul>
          <li>Prices are shown in Philippine pesos (₱) and include everything you pay. There are no extra checkout fees.</li>
          <li>Payments are processed by PayMongo. Your order is complete only when PayMongo confirms the payment to us.</li>
          <li>After payment, the resource appears in your Library, where you can download it again at any time while your account is open.</li>
          <li>
            Every resource comes with the license shown on its page: <strong>One teacher</strong> (your own classes),{" "}
            <strong>Several teachers</strong> (colleagues at the same school) or <strong>Whole school</strong> (everyone at one school).
          </li>
          <li>
            You may not resell, upload elsewhere, or share a resource beyond its license. You may print and adapt it for teaching within the
            license.
          </li>
        </ul>

        <h2>Selling</h2>
        <ul>
          <li>You may only sell resources you made yourself or have the right to sell. Do not upload copied textbooks or other people&apos;s work.</li>
          <li>Listings are reviewed before they are shown to buyers, and we may remove any listing that breaks these terms.</li>
          <li>
            GuroMart keeps a share of each sale, shown on the <Link href="/sell">Sell on GuroMart</Link> page for your plan. Your share is held
            for a short period to allow for refunds, then becomes available to pay out.
          </li>
          <li>You must verify your identity and add payout details before you can be paid.</li>
          <li>When a sale is refunded, your share of that sale is taken back.</li>
        </ul>

        <h2>Refunds</h2>
        <p>
          See our <Link href="/refunds">refund policy</Link> for when and how you can get your money back.
        </p>

        <h2>Copyright complaints</h2>
        <p>
          If you believe a listing copies your work, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with a link to the listing
          and proof that the work is yours. We will review it and remove listings that infringe.
        </p>

        <h2>Our responsibility</h2>
        <p>
          Sellers are responsible for the content of their resources. We check listings, but we do not guarantee that every resource fits your
          class or curriculum. Our responsibility for any purchase is limited to the amount you paid for it, except where Philippine law says
          otherwise.
        </p>

        <h2>Privacy</h2>
        <p>
          How we handle your information is explained in our <Link href="/privacy">privacy policy</Link>.
        </p>

        <h2>Changes</h2>
        <p>If we change these terms we will update the date at the top of this page and tell account holders by email about important changes.</p>

        <h2>Contact</h2>
        <p>
          Questions about these terms: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. These terms are governed by the laws of the
          Philippines.
        </p>
      </Prose>
    </PageShell>
  );
}
