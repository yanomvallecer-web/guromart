import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormAlert } from "@/components/ui/form";
import { getViewer } from "@/lib/auth/dal";
import { safeNextPath } from "@/lib/auth/roles";
import { publicEnv } from "@/lib/env";
import { enabledSocialProviders } from "@/lib/auth/social";
import { signInWithSocial } from "./actions";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <div>
        <h1 className="font-display text-3xl font-bold">Sign in to GuroMart</h1>
        <p className="mt-1 text-muted-foreground">New here? The same steps create your account.</p>
      </div>
      <Card className="flex flex-col gap-5 p-6">
        <Suspense fallback={<div className="h-40" />}>
          <SignInBody searchParams={searchParams} />
        </Suspense>
      </Card>
      <p className="text-xs text-muted-foreground">
        By continuing you agree to GuroMart&apos;s terms of use and privacy notice, which are being finalized before public launch.
      </p>
    </div>
  );
}

async function SignInBody({ searchParams }: { searchParams: PageProps<"/sign-in">["searchParams"] }) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  if (await getViewer()) redirect(next);
  const providers = enabledSocialProviders(publicEnv());
  return (
    <>
      {params.error === "oauth" ? (
        <FormAlert>We couldn&apos;t start that sign-in. Please try again, or use your email instead.</FormAlert>
      ) : params.error ? (
        <FormAlert>That sign-in didn&apos;t work. It may have expired or been cancelled, so please try again.</FormAlert>
      ) : null}
      {providers.length > 0 ? (
        <>
          <div className="flex flex-col gap-3">
            {providers.map((p) => (
              <form key={p.id} action={signInWithSocial}>
                <input type="hidden" name="next" value={next} />
                <input type="hidden" name="provider" value={p.id} />
                <Button type="submit" variant="outline" className="w-full">
                  {p.label}
                </Button>
              </form>
            ))}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or use your email <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}
      <SignInForm next={next} />
    </>
  );
}
