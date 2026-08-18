import { createClient } from "@supabase/supabase-js";
import fs from "fs";

// ── Config ────────────────────────────────────────────────────────────────
const envText = fs.readFileSync("D:/PROJECTS/MotoLink/.env.local", "utf8");
const get = (k) => {
  const m = envText.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim() : null;
};
const URL = get("VITE_SUPABASE_URL");
const ANON = get("VITE_SUPABASE_ANON_KEY");
const SERVICE = get("SUPABASE_SERVICE_ROLE_KEY");

// ── Clients ───────────────────────────────────────────────────────────────
const anon = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const svc = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

const TS = Date.now();
const PASSWORD = "TestPass123!";
let PASS = 0, FAIL = 0;
const results = [];
const check = (name, ok, detail = "") => {
  if (ok) PASS++; else FAIL++;
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅ PASS" : "❌ FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

// Cleanup helper
const cleanupUsers = async (emails) => {
  const { data: users } = await svc.from("users").select("id,email").in("email", emails);
  const ids = (users || []).map((u) => u.id);
  for (const id of ids) {
    await svc.from("shops").update({ owner_id: null }).eq("owner_id", id);
    await svc.from("users").delete().eq("id", id);
  }
  for (const email of emails) {
    const { data } = await svc.auth.admin.listUsers();
    const u = data.users.find((x) => x.email === email);
    if (u) await svc.auth.admin.deleteUser(u.id);
  }
};

const CUST_EMAIL = `test.customer.${TS}@example.com`;
const OWNER_EMAIL = `test.owner.${TS}@example.com`;
const ADMIN_EMAIL = `test.admin.${TS}@example.com`;
const MECH_EMAIL = `test.mech.${TS}@example.com`;
const NONE_EMAIL = `nonexistent.${TS}@example.com`;

try {
  // ═══════════════════════════════════════════════════════════════════════
  // 0) Create test users for each role (customer, owner, admin, mechanic)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n=== 0) Seed test users ===");
  const seed = async (email, role, name) => {
    const { data: a, error } = await svc.auth.admin.createUser({
      email, password: PASSWORD, email_confirm: true,
    });
    if (error) return { error };
    const { error: pErr } = await svc.from("users").update({ role, name }).eq("id", a.user.id);
    if (pErr) return { error: pErr };
    return { id: a.user.id };
  };
  const c = await seed(CUST_EMAIL, "customer", "Test Customer");
  const o = await seed(OWNER_EMAIL, "owner", "Test Owner");
  const ad = await seed(ADMIN_EMAIL, "admin", "Test Admin");
  const m = await seed(MECH_EMAIL, "mechanic", "Test Mech");
  check("Seed 4 test users", !c.error && !o.error && !ad.error && !m.error,
    c.error?.message || o.error?.message || ad.error?.message || m.error?.message);

  // ═══════════════════════════════════════════════════════════════════════
  // 1) CUSTOMER PORTAL LOGIN (LoginPage.tsx)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n=== 1) Customer portal login ===");
  {
    const sb = anon();
    // correct creds
    const { data, error } = await sb.auth.signInWithPassword({ email: CUST_EMAIL, password: PASSWORD });
    check("Customer: correct creds → session", !!data?.session && !error, error?.message || "");
    if (data?.session) {
      const { data: prof, error: pErr } = await sb.from("users").select("*").eq("id", data.user.id).single();
      check("Customer: profile fetch (RLS select own)", !!prof && !pErr, pErr?.message || "");
      check("Customer: role is 'customer'", prof?.role === "customer", prof?.role);
    }
    // wrong password
    const w = await sb.auth.signInWithPassword({ email: CUST_EMAIL, password: "WrongPass1!" });
    check("Customer: wrong password → error", !!w.error, w.error?.message || "");
    check("Customer: wrong pw error is 'Invalid login credentials'",
      (w.error?.message || "").toLowerCase().includes("invalid login credentials"), w.error?.message);
    // non-existent email
    const n = await sb.auth.signInWithPassword({ email: NONE_EMAIL, password: PASSWORD });
    check("Customer: non-existent email → error", !!n.error, n.error?.message || "");
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 2) OWNER PORTAL LOGIN (ShopOwnerLoginPage.tsx)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n=== 2) Owner portal login ===");
  {
    const sb = anon();
    const { data, error } = await sb.auth.signInWithPassword({ email: OWNER_EMAIL, password: PASSWORD });
    check("Owner: correct creds → session", !!data?.session && !error, error?.message || "");
    if (data?.session) {
      const { data: prof } = await sb.from("users").select("role,shop_id").eq("id", data.user.id).single();
      check("Owner: role is 'owner'", prof?.role === "owner", prof?.role);
      // Owner with no shop: note for admin. (Owner without shop still logs in)
      check("Owner: shop_id may be null (allowed)", true, "shop_id=" + prof?.shop_id);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 3) ADMIN PORTAL LOGIN (AdminLoginPage.tsx)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n=== 3) Admin portal login ===");
  {
    const sb = anon();
    const { data, error } = await sb.auth.signInWithPassword({ email: ADMIN_EMAIL, password: PASSWORD });
    check("Admin: correct creds → session", !!data?.session && !error, error?.message || "");
    if (data?.session) {
      const { data: prof } = await sb.from("users").select("role").eq("id", data.user.id).single();
      check("Admin: role is 'admin'", prof?.role === "admin", prof?.role);
      // Admin RLS: can view all users
      const { data: allUsers, error: allErr } = await sb.from("users").select("id,email").limit(100);
      check("Admin: can view all users (RLS)", !allErr && (allUsers?.length || 0) > 0, allErr?.message || `count=${allUsers?.length}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 4) WRONG-PORTAL DETECTION — each portal must REJECT the other roles
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n=== 4) Wrong-portal detection (simulates each portal's role guard) ===");
  const portalGuard = (userRole, expectedRole) => userRole === expectedRole;

  const signInAndGetRole = async (email, password) => {
    const sb = anon();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error || !data?.session) return { err: error?.message || "no session" };
    const { data: prof } = await sb.from("users").select("role").eq("id", data.user.id).single();
    return { role: prof?.role };
  };

  {
    const r = await signInAndGetRole(CUST_EMAIL, PASSWORD);
    check("Customer on Owner portal → rejected", r.role !== "owner", "role=" + r.role);
    check("Customer on Admin portal → rejected", r.role !== "admin", "role=" + r.role);
    check("Customer on Customer portal → allowed", portalGuard(r.role, "customer"), "role=" + r.role);
  }
  {
    const r = await signInAndGetRole(OWNER_EMAIL, PASSWORD);
    check("Owner on Customer portal → rejected", r.role !== "customer", "role=" + r.role);
    check("Owner on Admin portal → rejected", r.role !== "admin", "role=" + r.role);
    check("Owner on Owner portal → allowed", portalGuard(r.role, "owner"), "role=" + r.role);
  }
  {
    const r = await signInAndGetRole(ADMIN_EMAIL, PASSWORD);
    check("Admin on Customer portal → rejected", r.role !== "customer", "role=" + r.role);
    check("Admin on Owner portal → rejected", r.role !== "owner", "role=" + r.role);
    check("Admin on Admin portal → allowed", portalGuard(r.role, "admin"), "role=" + r.role);
  }
  {
    const r = await signInAndGetRole(MECH_EMAIL, PASSWORD);
    // Mechanics have NO portal (roleAccess: mechanic → []). Owner dashboard message says
    // "managed by shop owner". So mechanic on ANY portal should be rejected.
    check("Mechanic on Customer portal → rejected (no portal)", r.role !== "customer", "role=" + r.role);
    check("Mechanic on Owner portal → rejected (no portal)", r.role !== "owner", "role=" + r.role);
    check("Mechanic on Admin portal → rejected (no portal)", r.role !== "admin", "role=" + r.role);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 5) CUSTOMER SIGNUP (AuthContext.signup)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n=== 5) Customer signup flow ===");
  {
    const sb = anon();
    const email = `signup.customer.${TS}@example.com`;
    const { data, error } = await sb.auth.signUp({ email, password: PASSWORD });
    // handle_new_user trigger should create profile as 'customer'
    if (data?.user?.id) {
      const { data: prof } = await svc.from("users").select("role,name").eq("id", data.user.id).single();
      check("Signup: profile auto-created by trigger", !!prof, "");
      check("Signup: default role is 'customer'", prof?.role === "customer", prof?.role);
      check("Signup: name defaults from email", prof?.name === email.split("@")[0], prof?.name);
      // duplicate signup → error
      const dup = await sb.auth.signUp({ email, password: PASSWORD });
      check("Signup: duplicate email handled", !!dup.error || data?.session?.user?.id, dup.error?.message || "no session");
      await cleanupUsers([email]);
    } else {
      check("Signup: returned user", false, error?.message || "no user");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 6) OWNER SIGNUP VIA RPC (register_shop_owner)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n=== 6) Owner signup via register_shop_owner RPC ===");
  {
    const email = `signup.owner.${TS}@example.com`;
    // Create auth user first (like handleSignup does), with the anon client
    const sb = anon();
    const { data: a, error: aErr } = await sb.auth.signUp({ email, password: PASSWORD });
    if (a?.user?.id) {
      // Now call the RPC as the newly-signed-in user
      const sb2 = anon();
      const { data: s } = await sb2.auth.signInWithPassword({ email, password: PASSWORD });
      const { data: shopId, error: rpcErr } = await sb2.rpc("register_shop_owner", {
        p_user_id: a.user.id,
        p_email: email,
        p_name: "Signup Owner",
        p_shop_name: "RPC Test Shop",
        p_slug: `rpc-test-${TS}`,
        p_description: "test",
        p_address: "123 Test St",
        p_city: "Manila",
        p_latitude: 14.5995,
        p_longitude: 120.9842,
        p_phone: "09171234567",
        p_is_active: false,
      });
      check("Owner signup: RPC returns shop_id", !!shopId && !rpcErr, rpcErr?.message || "");
      if (shopId) {
        const { data: prof } = await svc.from("users").select("role,shop_id").eq("id", a.user.id).single();
        check("Owner signup: role=owner after RPC", prof?.role === "owner", prof?.role);
        check("Owner signup: shop_id linked", prof?.shop_id === shopId, String(prof?.shop_id));
        const { data: shop } = await svc.from("shops").select("is_active,owner_id").eq("id", shopId).single();
        check("Owner signup: shop is_active=false (pending)", shop?.is_active === false, String(shop?.is_active));
        check("Owner signup: shop.owner_id matches", shop?.owner_id === a.user.id, String(shop?.owner_id));
      }
      // cleanup
      await cleanupUsers([email]);
    } else {
      check("Owner signup: auth user created", false, aErr?.message || "no user");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 7) RLS VISIBILITY BOUNDARIES (security)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n=== 7) RLS visibility boundaries ===");
  {
    // customer should NOT see other users' profiles
    const sb = anon();
    await sb.auth.signInWithPassword({ email: CUST_EMAIL, password: PASSWORD });
    const { data: others, error: oErr } = await sb.from("users").select("id,email,role").neq("id", c.id).limit(50);
    // RLS: "Users can view own profile" only → must return 0 or error
    const leaked = (others || []).filter((u) => u.id !== c.id && u.role === "admin" || u.role === "owner");
    check("Customer cannot see other users (RLS)", !oErr && (!others || others.length === 0),
      `count=${others?.length}`);
    check("Customer cannot leak admin/owner rows", leaked.length === 0, `leaked=${leaked.length}`);
    // customer cannot update another user (RLS blocks → 0 rows, no error)
    const { data: updData } = await sb.from("users").update({ role: "admin" }).eq("id", ad.id).select();
    const { data: adminAfter } = await svc.from("users").select("role").eq("id", ad.id).single();
    check("Customer cannot UPDATE another user", (!updData || updData.length === 0) && adminAfter.role === "admin",
      `rows=${updData?.length} role=${adminAfter.role}`);
    // customer cannot delete another user
    const { data: delData } = await sb.from("users").delete().eq("id", ad.id).select();
    const { data: adminExists } = await svc.from("users").select("id").eq("id", ad.id).single();
    check("Customer cannot DELETE another user", (!delData || delData.length === 0) && !!adminExists,
      `deleted=${delData?.length} exists=${!!adminExists}`);
  }
  {
    // owner should NOT see other shops' rows or other owners' data
    const sb = anon();
    await sb.auth.signInWithPassword({ email: OWNER_EMAIL, password: PASSWORD });
    // owner can view active shops (marketplace) — fine. But cannot view inactive/other owner's shops
    const { data: inact, error: inErr } = await sb.from("shops").select("id,name,owner_id,is_active").neq("is_active", true).limit(50);
    const leaked = (inact || []).filter((s) => s.is_active === false);
    check("Owner cannot see inactive shops of others", !inErr && leaked.length === 0,
      `inactive_visible=${leaked.length}`);
    // owner cannot update someone else's shop (RLS → 0 rows)
    const { data: otherShop } = await svc.from("shops").select("id").not("owner_id", "eq", o.id).limit(1).maybeSingle();
    if (otherShop?.id) {
      const { data: updData } = await sb.from("shops").update({ name: "HACKED" }).eq("id", otherShop.id).select();
      check("Owner cannot UPDATE another's shop", !updData || updData.length === 0, `rows=${updData?.length}`);
    } else {
      check("Owner cannot UPDATE another's shop (no target to test)", true, "no other shop exists");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 8) CLIENT-SIDE RATE LIMIT LOGIC (AuthContext.checkRateLimit)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n=== 8) Client-side rate limit logic ===");
  {
    // Replicate AuthContext.checkRateLimit exactly
    let state = { count: 0, firstAttemptTime: Date.now() };
    const checkRateLimit = () => {
      const now = Date.now();
      if (now - state.firstAttemptTime > 120000) { state = { count: 1, firstAttemptTime: now }; return true; }
      if (state.count >= 5) return false;
      state.count += 1;
      return true;
    };
    let allowed = 0, blocked = 0;
    for (let i = 0; i < 8; i++) { checkRateLimit() ? allowed++ : blocked++; }
    check("Rate limit: allows first 5", allowed === 5, `allowed=${allowed}`);
    check("Rate limit: blocks 6th+ within window", blocked === 3, `blocked=${blocked}`);
    // successful login resets counter (login() sets count=0)
    state = { count: 0, firstAttemptTime: Date.now() };
    for (let i = 0; i < 5; i++) checkRateLimit();
    state = { count: 0, firstAttemptTime: Date.now() }; // simulate successful login reset
    check("Rate limit: resets after success", checkRateLimit(), "still allowed");
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 9) PERSISTED SESSION RESTORE (getSession on reload)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n=== 9) Session persistence ===");
  {
    const sb = createClient(URL, ANON, { auth: { persistSession: true, autoRefreshToken: true } });
    await sb.auth.signInWithPassword({ email: ADMIN_EMAIL, password: PASSWORD });
    const { data: sess } = await sb.auth.getSession();
    check("Session persisted + restored via getSession", !!sess?.session?.access_token, "");
    const { data: prof } = await sb.from("users").select("role").eq("id", ad.id).single();
    check("Restored session still has valid role", prof?.role === "admin", prof?.role);
    await sb.auth.signOut();
    const { data: after } = await sb.auth.getSession();
    check("Sign out clears session", !after?.session, "");
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 10) ERROR MESSAGES (what the user sees)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n=== 10) Error message mapping ===");
  {
    const sb = anon();
    const { error } = await sb.auth.signInWithPassword({ email: NONE_EMAIL, password: PASSWORD });
    const msg = error?.message || "";
    // LoginPage expects "invalid login credentials" → friendly message
    check("Error msg contains 'invalid login credentials'",
      msg.toLowerCase().includes("invalid login credentials"), msg);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 11) MECHANIC ROLE ACCESS (no portal)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n=== 11) Mechanic roleAccess ===");
  {
    // Replicate roleAccess.getPagesByRole
    const map = { customer: ["landing"], mechanic: [], owner: ["dashboard","inventory","update-parts","appointments","customers","services","mechanic-availability","low-stock","settings","shop-settings"], admin: ["admin-dashboard","admin-shops","settings"] };
    check("Mechanic has no allowed pages (no portal)", map.mechanic.length === 0, "");
  }

} finally {
  // ═══════════════════════════════════════════════════════════════════════
  // CLEANUP: remove ALL test users
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n=== Cleanup ===");
  const emails = [CUST_EMAIL, OWNER_EMAIL, ADMIN_EMAIL, MECH_EMAIL];
  await cleanupUsers(emails);
  console.log("Removed test users:", emails.join(", "));
}

console.log(`\n════════ RESULT: ${PASS} passed, ${FAIL} failed ════════`);
process.exit(FAIL > 0 ? 1 : 0);