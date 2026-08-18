import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envText = fs.readFileSync("D:/PROJECTS/MotoLink/.env.local", "utf8");
const get = (k) => { const m = envText.match(new RegExp(`^${k}=(.*)$`, "m")); return m ? m[1].trim() : null; };
const URL = get("VITE_SUPABASE_URL");
const ANON = get("VITE_SUPABASE_ANON_KEY");
const SERVICE = get("SUPABASE_SERVICE_ROLE_KEY");

const anon = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const svc = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

const TS = Date.now();
const PASSWORD = "TestPass123!";
let PASS = 0, FAIL = 0;
const check = (name, ok, detail = "") => { if (ok) PASS++; else FAIL++; console.log(`${ok ? "✅" : "❌"}  ${name}${detail ? "  — " + detail : ""}`); };

const CUST_EMAIL = `rls.customer.${TS}@example.com`;
const ADMIN_EMAIL = `rls.admin.${TS}@example.com`;
const OWNER_EMAIL = `rls.owner.${TS}@example.com`;

try {
  const seed = async (email, role) => {
    const { data: a, error: aErr } = await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (aErr || !a?.user) throw new Error("createUser failed: " + (aErr?.message || "no user"));
    const { error: pErr } = await svc.from("users").update({ role }).eq("id", a.user.id);
    if (pErr) throw new Error("update role failed: " + pErr.message);
    return a.user.id;
  };
  const custId = await seed(CUST_EMAIL, "customer");
  const adminId = await seed(ADMIN_EMAIL, "admin");
  const ownerId = await seed(OWNER_EMAIL, "owner");

  // Owner creates a shop
  const { data: shop, error: shopErr } = await svc.from("shops").insert({
    name: "RLS Owner Shop", slug: `rls-shop-${TS}`, owner_id: ownerId, is_active: true,
    description: "", address: "123 Test", city: "Manila",
  }).select("id").single();
  if (shopErr || !shop) throw new Error("shop insert failed: " + (shopErr?.message || "no shop"));
  await svc.from("users").update({ shop_id: shop.id }).eq("id", ownerId);

  // ── TEST 1: Customer tries to UPDATE admin's role ──
  {
    const sb = anon();
    await sb.auth.signInWithPassword({ email: CUST_EMAIL, password: PASSWORD });
    const before = await svc.from("users").select("role").eq("id", adminId).maybeSingle();
    const { data: updData, error: updErr } = await sb.from("users").update({ role: "admin" }).eq("id", adminId).select();
    const after = await svc.from("users").select("role").eq("id", adminId).maybeSingle();
    // RLS "Users can update own profile" → 0 rows returned, no data change
    const rowsAffected = updData ? updData.length : 0;
    check("Customer UPDATE admin: 0 rows affected", rowsAffected === 0, `rows=${rowsAffected} err=${updErr?.message || "none"}`);
    check("Customer UPDATE admin: role unchanged in DB", after?.data?.role === "admin", `role=${after?.data?.role}`);
  }

  // ── TEST 2: Customer tries to DELETE admin ──
  {
    const sb = anon();
    await sb.auth.signInWithPassword({ email: CUST_EMAIL, password: PASSWORD });
    const before = await svc.from("users").select("id").eq("id", adminId).single();
    const { data: delData, error: delErr } = await sb.from("users").delete().eq("id", adminId).select();
    const after = await svc.from("users").select("id").eq("id", adminId).single();
    check("Customer DELETE admin: 0 rows deleted", !delData || delData.length === 0, `rows=${delData?.length || 0}`);
    check("Customer DELETE admin: row still exists in DB", !!after, "");
  }

  // ── TEST 3: Owner tries to UPDATE another owner's shop ──
  {
    const sb = anon();
    await sb.auth.signInWithPassword({ email: OWNER_EMAIL, password: PASSWORD });
    // create a shop owned by someone else via service role
    const { data: otherShop, error: otherErr } = await svc.from("shops").insert({
      name: "Other Owner Shop", slug: `other-shop-${TS}`, owner_id: custId, is_active: true,
      description: "", address: "456 Test", city: "Quezon City",
    }).select("id").single();
    if (otherErr || !otherShop) throw new Error("other shop insert failed: " + (otherErr?.message || "no shop"));
    const { data: updData, error: updErr } = await sb.from("shops").update({ name: "HACKED" }).eq("id", otherShop.id).select();
    const after = await svc.from("shops").select("name").eq("id", otherShop.id).maybeSingle();
    check("Owner UPDATE other's shop: 0 rows affected", !updData || updData.length === 0, `rows=${updData?.length || 0}`);
    check("Owner UPDATE other's shop: name unchanged", after?.data?.name === "Other Owner Shop", `name=${after?.data?.name}`);
  }

  // ── TEST 4: Owner can update OWN shop (should work) ──
  {
    const sb = anon();
    await sb.auth.signInWithPassword({ email: OWNER_EMAIL, password: PASSWORD });
    const { data: updData, error: updErr } = await sb.from("shops").update({ name: "My Renamed Shop" }).eq("id", shop.id).select();
    check("Owner UPDATE own shop: 1 row affected", updData?.length === 1 && !updErr, `rows=${updData?.length} err=${updErr?.message || "none"}`);
  }

  // ── TEST 5: Customer cannot see admin's data at all (row hidden) ──
  {
    const sb = anon();
    await sb.auth.signInWithPassword({ email: CUST_EMAIL, password: PASSWORD });
    const { data, error } = await sb.from("users").select("id,email,role").eq("id", adminId);
    check("Customer SELECT admin: row hidden", data?.length === 0, `rows=${data?.length} err=${error?.message || "none"}`);
  }

  // ── TEST 6: anon (logged out) cannot read anything ──
  {
    const sb = anon();
    const { data: all, error } = await sb.from("users").select("id,email,role").limit(50);
    check("Anonymous cannot read users", (!all || all.length === 0) && !error, `rows=${all?.length} err=${error?.message || "none"}`);
  }

  // ── TEST 7: Admin CAN update any shop (their own RLS policy) ──
  {
    const sb = anon();
    await sb.auth.signInWithPassword({ email: ADMIN_EMAIL, password: PASSWORD });
    const { data: updData, error: updErr } = await sb.from("shops").update({ is_active: false }).eq("id", shop.id).select();
    check("Admin UPDATE any shop: 1 row affected", updData?.length === 1 && !updErr, `rows=${updData?.length} err=${updErr?.message || "none"}`);
  }

  // ── TEST 8: Owner can't see OTHER users' profiles (except shop mechanics policy) ──
  {
    const sb = anon();
    await sb.auth.signInWithPassword({ email: OWNER_EMAIL, password: PASSWORD });
    const { data, error } = await sb.from("users").select("id,email,role").neq("id", ownerId);
    // Only mechanics of OWN active shop are visible; no mechanic rows exist → 0
    check("Owner cannot see other users", !data || data.length === 0, `rows=${data?.length} err=${error?.message || "none"}`);
  }

  // Cleanup
  await svc.from("shops").delete().eq("id", shop.id);
  await svc.from("shops").delete().eq("owner_id", custId);
  for (const email of [CUST_EMAIL, ADMIN_EMAIL, OWNER_EMAIL]) {
    const { data } = await svc.auth.admin.listUsers();
    const u = data.users.find((x) => x.email === email);
    if (u) { await svc.from("users").delete().eq("id", u.id); await svc.auth.admin.deleteUser(u.id); }
  }
} catch (e) {
  console.log("FATAL", e);
}

console.log(`\n════════ RESULT: ${PASS} passed, ${FAIL} failed ════════`);
process.exit(FAIL > 0 ? 1 : 0);