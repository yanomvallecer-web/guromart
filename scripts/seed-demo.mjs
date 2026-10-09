// Loads clearly labelled demonstration shops and resources into a LOCAL
// Supabase stack so the catalog has something to browse during development.
//
//   node --env-file=.env.local scripts/seed-demo.mjs           add demo data
//   node --env-file=.env.local scripts/seed-demo.mjs --remove  delete it again
//
// Every demo title starts with "[Demo]", every demo shop says it is not a real
// seller, and demo accounts use the reserved @demo.guromart.invalid domain.
// No reviews, ratings, sales or download counts are invented. The script
// refuses to run against anything but a local stack.
import { deflateSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";

const DEMO_DOMAIN = "demo.guromart.invalid";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (run with --env-file=.env.local).");
  process.exit(1);
}
const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  console.error(`Refusing to load demo data into ${host}. Demo data is for a local Supabase stack only.`);
  process.exit(1);
}

const db = createClient(url, secret, { auth: { persistSession: false } });

async function demoUsers() {
  const found = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    found.push(...data.users.filter((u) => u.email?.endsWith(`@${DEMO_DOMAIN}`)));
    if (data.users.length < 1000) return found;
  }
}

async function removeDemo() {
  const users = await demoUsers();
  for (const user of users) {
    const { data: account } = await db.from("seller_accounts").select("id").eq("user_id", user.id).maybeSingle();
    if (account) {
      for (const bucket of ["product-files", "product-previews", "storefront-media"]) {
        const { data: folders } = await db.storage.from(bucket).list(account.id, { limit: 1000 });
        for (const entry of folders ?? []) {
          const prefix = `${account.id}/${entry.name}`;
          const { data: inner } = await db.storage.from(bucket).list(prefix, { limit: 1000 });
          const paths = inner?.length ? inner.map((f) => `${prefix}/${f.name}`) : [prefix];
          await db.storage.from(bucket).remove(paths);
        }
      }
      // Seller records are kept on purpose when real accounts close (sales history
      // depends on them), so demo ones are deleted explicitly, products first.
      const { data: stores } = await db.from("storefronts").select("id").eq("seller_account_id", account.id);
      const storeIds = (stores ?? []).map((s) => s.id);
      if (storeIds.length) {
        const { error: productError } = await db.from("products").delete().in("storefront_id", storeIds);
        if (productError) throw new Error(`Could not delete demo products (were they bought during testing?): ${productError.message}`);
      }
      const { error: accountError } = await db.from("seller_accounts").delete().eq("id", account.id);
      if (accountError) throw accountError;
    }
    const { error } = await db.auth.admin.deleteUser(user.id);
    if (error) throw error;
  }
  console.log(`Removed ${users.length} demo accounts and everything they owned.`);
}

// A tiny valid one-page PDF that says it is demo content.
function demoPdf(title) {
  const text = `GuroMart demo file: ${title}. Not a real teaching resource.`.replace(/[()\\]/g, "");
  const stream = `BT /F1 12 Tf 40 760 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

// A plain coloured 400x300 PNG used as the preview image, with a darker band so it reads as a card.
function demoPng([r, g, b]) {
  const width = 400;
  const height = 300;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    const shade = y > 220 ? 0.75 : 1;
    for (let x = 0; x < width; x++) {
      raw[row + 1 + x * 3] = Math.round(r * shade);
      raw[row + 2 + x * 3] = Math.round(g * shade);
      raw[row + 3 + x * 3] = Math.round(b * shade);
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const SHOPS = [
  {
    key: "science",
    name: "[Demo] Science Corner",
    type: "teacher",
    color: [26, 86, 168],
    products: [
      { title: "Grade 4 Science Quarter 1 Worksheets", category: "worksheet", subject: "science", grades: ["grade-4"], price: 7500, period: "quarter-1" },
      { title: "Daily Lesson Log: Grade 5 Science, Week 3", category: "daily-lesson-log", subject: "science", grades: ["grade-5"], price: 5000, period: "quarter-1" },
      { title: "States of Matter Activity Sheets", category: "activity-sheet", subject: "science", grades: ["grade-3", "grade-4"], price: 0 },
    ],
  },
  {
    key: "math",
    name: "[Demo] Matematika Hub",
    type: "creator",
    color: [34, 139, 94],
    products: [
      { title: "Adding Dissimilar Fractions Practice Set", category: "worksheet", subject: "mathematics", grades: ["grade-5"], price: 6000 },
      { title: "Grade 6 Mathematics Summative Test, Quarter 2", category: "assessment", subject: "mathematics", grades: ["grade-6"], price: 12000, period: "quarter-2" },
      { title: "Multiplication Table Flashcards", category: "flashcards", subject: "mathematics", grades: ["grade-2", "grade-3"], price: 0 },
    ],
  },
  {
    key: "filipino",
    name: "[Demo] Araling Filipino",
    type: "teacher",
    color: [196, 112, 24],
    products: [
      { title: "Banghay Aralin sa Filipino 7: Pang-uri", category: "lesson-plan", subject: "filipino", grades: ["grade-7"], price: 8000 },
      { title: "Araling Panlipunan 8 Reviewer: Kabihasnang Asyano", category: "assessment", subject: "araling-panlipunan", grades: ["grade-8"], price: 15000 },
    ],
  },
];

async function idsByCode(table) {
  const { data, error } = await db.from(table).select("id, code");
  if (error) throw error;
  return new Map(data.map((r) => [r.code, r.id]));
}

async function addDemo() {
  if ((await demoUsers()).length) {
    console.error("Demo data is already loaded. Run with --remove first to reload it.");
    process.exit(1);
  }
  const [categories, subjects, grades, periods] = await Promise.all([
    idsByCode("product_categories"),
    idsByCode("subjects"),
    idsByCode("grade_levels"),
    idsByCode("academic_periods"),
  ]);
  const need = (map, code, what) => {
    if (!map.has(code)) throw new Error(`Unknown ${what} code "${code}" in demo data.`);
    return map.get(code);
  };

  let count = 0;
  for (const shop of SHOPS) {
    const { data: created, error: userError } = await db.auth.admin.createUser({
      email: `${shop.key}@${DEMO_DOMAIN}`,
      email_confirm: true,
      user_metadata: { full_name: `${shop.name} (demo account)` },
    });
    if (userError) throw userError;
    const userId = created.user.id;
    const { data: account, error: accountError } = await db
      .from("seller_accounts")
      .insert({ user_id: userId, seller_type: shop.type, status: "active", onboarding_step: 7 })
      .select("id")
      .single();
    if (accountError) throw accountError;
    const { data: store, error: storeError } = await db
      .from("storefronts")
      .insert({
        seller_account_id: account.id,
        slug: `demo-${shop.key}`,
        name: shop.name,
        tagline: "Demo shop with sample data. Not a real seller.",
        description: "This shop exists only in local development so the catalog has something to show. Its resources are placeholders.",
        is_published: true,
      })
      .select("id")
      .single();
    if (storeError) throw storeError;
    const { error: roleError } = await db.from("user_roles").insert({ user_id: userId, role: "seller" });
    if (roleError && roleError.code !== "23505") throw roleError;

    for (const p of shop.products) {
      const title = `[Demo] ${p.title}`;
      const slug = `demo-${shop.key}-${count++}`;
      const { data: product, error } = await db
        .from("products")
        .insert({
          storefront_id: store.id,
          slug,
          title,
          summary: "Demonstration listing for local development.",
          description: `${p.title}. This is demonstration data for local development. It is not a real product and the file is a one-page placeholder.`,
          category_id: need(categories, p.category, "category"),
          subject_id: need(subjects, p.subject, "subject"),
          academic_period_id: p.period ? need(periods, p.period, "period") : null,
          language_code: p.subject === "filipino" || p.subject === "araling-panlipunan" ? "fil" : "en",
          price_centavos: p.price,
          license_type: "single_teacher",
          copyright_declared_at: new Date().toISOString(),
          status: "draft",
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: gradeError } = await db.from("product_grade_levels").insert(p.grades.map((g) => ({ product_id: product.id, grade_level_id: need(grades, g, "grade") })));
      if (gradeError) throw gradeError;

      const filePath = `${account.id}/${product.id}/${crypto.randomUUID()}.pdf`;
      const pdf = demoPdf(title);
      const up1 = await db.storage.from("product-files").upload(filePath, pdf, { contentType: "application/pdf" });
      if (up1.error) throw up1.error;
      await db.from("product_files").insert({
        product_id: product.id,
        storage_path: filePath,
        original_filename: `${slug}.pdf`,
        mime_type: "application/pdf",
        file_format: "pdf",
        size_bytes: pdf.length,
        scan_status: "clean",
      });
      const previewPath = `${account.id}/${product.id}/${crypto.randomUUID()}.png`;
      const up2 = await db.storage.from("product-previews").upload(previewPath, demoPng(shop.color), { contentType: "image/png" });
      if (up2.error) throw up2.error;
      await db.from("product_previews").insert({ product_id: product.id, storage_path: previewPath, alt_text: `Demo preview for ${p.title}` });

      // Publishing goes through the same database checks as staff approval.
      const { error: publishError } = await db.from("products").update({ status: "published" }).eq("id", product.id);
      if (publishError) throw publishError;
    }
  }
  console.log(`Loaded ${SHOPS.length} demo shops with ${count} demo resources. Remove them with --remove.`);
}

if (process.argv.includes("--remove")) await removeDemo();
else await addDemo();
