/**
 * The Android app opens the site with ?app=android (and an android-app:// referrer).
 * The flag is kept in sessionStorage, which belongs to the app's own tab, so it never
 * leaks into the same phone's Chrome. Runs before the page paints to avoid a flash.
 */
const DETECT_ANDROID_APP = `try{var s=sessionStorage,q=new URLSearchParams(location.search);if(q.get("app")==="android"||document.referrer.indexOf("android-app://")===0)s.setItem("gm-app","android");if(s.getItem("gm-app")==="android")document.documentElement.dataset.app="android"}catch(e){}`;

export function AndroidAppDetect() {
  return <script dangerouslySetInnerHTML={{ __html: DETECT_ANDROID_APP }} />;
}

/**
 * Hides paid checkout inside the Android app. Google Play requires its own billing for
 * digital goods bought in an app, and doesn't allow pointing buyers elsewhere to pay,
 * so the app says plainly that paid resources can't be bought there.
 */
export function WebCheckoutOnly({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div data-web-checkout>{children}</div>
      <p data-app-only className="text-sm text-muted-foreground">
        Paid resources can&apos;t be bought in the Android app.
      </p>
    </>
  );
}
