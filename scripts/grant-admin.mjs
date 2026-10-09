// Grants the admin role to an existing account. Run once to create the first
// administrator; after that, admins can grant roles from the database.
// Usage: node --env-file=.env.local scripts/grant-admin.mjs teacher@example.com
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!email || !url || !secret) {
  console.error("Usage: node --env-file=.env.local scripts/grant-admin.mjs <email>  (needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY)");
  process.exit(1);
}

const db = createClient(url, secret, { auth: { persistSession: false } });
let user;
for (let page = 1; !user; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (data.users.length < 1000) break;
}
if (!user) {
  console.error(`No account for ${email}. Sign in once on the site first.`);
  process.exit(1);
}
const { error } = await db.from("user_roles").upsert({ user_id: user.id, role: "admin" }, { onConflict: "user_id,role", ignoreDuplicates: true });
if (error) throw error;
console.log(`${email} is now an admin.`);
