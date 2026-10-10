import type { MetadataRoute } from "next";

/** Makes GuroMart installable, and is what the Android app (a Trusted Web Activity) is built from. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "GuroMart",
    short_name: "GuroMart",
    description: "Lesson plans, worksheets, assessments and classroom resources made by Filipino teachers.",
    lang: "en-PH",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#1a56a8",
    categories: ["education", "shopping"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // The bag sits well inside the safe zone, so the same artwork works as a maskable icon.
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
