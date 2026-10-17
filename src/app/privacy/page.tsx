import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { Prose } from "@/components/layout/prose";
import { CONTACT_EMAIL, POLICY_UPDATED } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What GuroMart collects, why, who it is shared with, and how to see or delete it.",
};

export default function PrivacyPage() {
  return (
    <PageShell title="Privacy policy" description={`Last updated ${POLICY_UPDATED}`}>
      <Prose>
        <p>
          GuroMart is a marketplace where Filipino teachers buy and sell teaching resources. This page explains what personal information
          we collect, why we need it, who we share it with, and what you can ask us to do with it. We follow the Philippine Data Privacy Act
          of 2012 (Republic Act No. 10173).
        </p>

        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Your account:</strong> your email address and display name. If you sign in with Facebook or Google, we receive your name,
            email address and profile picture from them. We never receive or store your Facebook or Google password.
          </li>
          <li>
            <strong>What you buy:</strong> your cart, orders, amounts paid, and which resources you downloaded and when.
          </li>
          <li>
            <strong>Payments:</strong> payments are handled by PayMongo. We store the payment reference and status. Your card, GCash or Maya
            details go to PayMongo, not to us.
          </li>
          <li>
            <strong>If you sell:</strong> your shop name and description, the files you upload, an ID document you submit for verification,
            and the GCash, Maya or bank account where you want to be paid.
          </li>
          <li>
            <strong>What you write:</strong> reviews, reports of copied content, and messages to support.
          </li>
          <li>
            <strong>Technical records:</strong> when you download a file we keep a scrambled (hashed) form of your IP address to stop abuse of
            download links. We use a sign-in cookie to keep you signed in. We do not use advertising or tracking cookies.
          </li>
        </ul>

        <h2>Why we use it</h2>
        <ul>
          <li>To create your account and keep you signed in.</li>
          <li>To complete purchases and give you access to the resources you paid for.</li>
          <li>To pay sellers, and to check that sellers are real people before they can be paid.</li>
          <li>To prevent fraud, copyright abuse and misuse of download links.</li>
          <li>To answer your questions and handle refunds and disputes.</li>
          <li>To keep the financial records the law requires.</li>
        </ul>
        <p>We do not sell your personal information, and we do not use it for advertising.</p>

        <h2>Who we share it with</h2>
        <ul>
          <li>
            <strong>Service providers that run GuroMart:</strong> Supabase (database, sign-in and file storage), Vercel (website hosting),
            PayMongo (payments) and our email provider (sign-in emails). They handle your information only to provide these services to us.
          </li>
          <li>
            <strong>Sellers:</strong> when you buy a resource, its seller can see that a sale happened and the amount. Sellers do not see your
            email address.
          </li>
          <li>
            <strong>Facebook and Google:</strong> only if you choose to sign in with them, and only to confirm who you are.
          </li>
          <li>
            <strong>Authorities:</strong> when the law requires it.
          </li>
        </ul>
        <p>Some of these providers store data outside the Philippines, for example in Singapore or the United States.</p>

        <h2>How long we keep it</h2>
        <p>
          We keep your account information while your account is open. When you ask us to delete your account, we delete your personal
          information within 30 days. We keep order and payment records, without your name or email, for as long as tax and accounting rules
          require.
        </p>

        <h2>How we protect it</h2>
        <p>
          Resource files and seller ID documents are kept in private storage that only signed-in, authorised people can reach. Access to
          personal information inside GuroMart is limited by account role, and changes to payout details are logged.
        </p>

        <h2>Your rights</h2>
        <p>
          You can ask to see the personal information we hold about you, correct it, get a copy of it, or have it deleted. You can also object
          to how we use it. To do any of these, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from the address on your account.
          See <Link href="/data-deletion">how to delete your data</Link> for the deletion steps. If you are not satisfied with our answer, you
          can complain to the National Privacy Commission at privacy.gov.ph.
        </p>

        <h2>Children</h2>
        <p>GuroMart is for teachers and other adults. It is not meant for children under 18.</p>

        <h2>Changes</h2>
        <p>If we change this policy we will update the date at the top of this page, and tell account holders by email about important changes.</p>

        <h2>Contact</h2>
        <p>
          Questions about privacy: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </Prose>
    </PageShell>
  );
}
