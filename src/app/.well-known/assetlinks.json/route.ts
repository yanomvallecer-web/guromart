/**
 * Digital Asset Links: proves the Android app and this site belong together, so the
 * app opens full screen with no browser address bar. The fingerprints come from Play
 * Console (Test and release > App integrity > App signing) and go in Vercel's
 * environment variables; a redeploy picks them up.
 */
export function GET() {
  const packageName = process.env.ANDROID_PACKAGE_NAME || "com.guromart.app";
  const fingerprints = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS ?? "")
    .split(",")
    .map((f) => f.trim().toUpperCase())
    .filter(Boolean);
  const statements = fingerprints.length
    ? [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: { namespace: "android_app", package_name: packageName, sha256_cert_fingerprints: fingerprints },
        },
      ]
    : [];
  return Response.json(statements);
}
