import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { TabBar } from "@/components/site/tab-bar";
import "./globals.css";

const body = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display-face", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: { default: "GuroMart · Everything You Need to Teach", template: "%s · GuroMart" },
  description: "Lesson plans, worksheets, assessments and classroom resources made by Filipino teachers.",
  openGraph: { siteName: "GuroMart", locale: "en_PH", type: "website" },
};

export const viewport: Viewport = { themeColor: "#1a56a8" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-PH" className={`${body.variable} ${display.variable}`}>
      <body className="flex min-h-dvh flex-col pb-[calc(var(--bottom-bar)+env(safe-area-inset-bottom))] md:pb-0">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
        <TabBar />
      </body>
    </html>
  );
}
