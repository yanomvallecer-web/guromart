import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Enables forbidden() for server-side role checks.
    authInterrupts: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The live phone viewer may frame this origin's own pages. Other origins,
      // ordinary page visits and browsers without Fetch Metadata keep DENY.
      {
        source: "/:path*",
        has: [
          { type: "header", key: "sec-fetch-site", value: "same-origin" },
          { type: "header", key: "sec-fetch-dest", value: "iframe" },
        ],
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
      // Keep the viewer itself top-level; do not allow nested preview frames.
      { source: "/app-preview.html", headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
      ] },
      // Browsers check for a new service worker on every visit instead of using a cached copy.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
};

export default nextConfig;
