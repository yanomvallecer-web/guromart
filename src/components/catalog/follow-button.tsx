"use client";

import { useState, useTransition } from "react";
import { UserCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleFollow } from "@/app/shop/actions";

const count = new Intl.NumberFormat("en-PH");

/** Follow or unfollow a shop, with its real follower count. */
export function FollowButton({ storefrontId, path, initiallyFollowing, followers }: { storefrontId: string; path: string; initiallyFollowing: boolean; followers: number }) {
  const [state, setState] = useState({ following: initiallyFollowing, followers });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toggle = () =>
    start(async () => {
      const result = await toggleFollow(storefrontId, !state.following, path);
      if (result.error) return setError(result.error);
      setError(null);
      setState((s) => ({ following: Boolean(result.following), followers: result.count ?? s.followers }));
    });
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button type="button" variant={state.following ? "outline" : "primary"} size="sm" className="h-11" onClick={toggle} disabled={pending} aria-pressed={state.following}>
        {state.following ? <UserCheck aria-hidden /> : <UserPlus aria-hidden />} {state.following ? "Following" : "Follow shop"}
      </Button>
      <FollowerCount n={state.followers} />
      {error ? <p role="alert" className="w-full text-xs text-danger">{error}</p> : null}
    </div>
  );
}

export function FollowerCount({ n }: { n: number }) {
  if (n <= 0) return null;
  return <span data-testid="follower-count" className="text-sm text-muted-foreground">{count.format(n)} {n === 1 ? "follower" : "followers"}</span>;
}
