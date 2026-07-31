# MotoLink — Brain / Memory File

> **RULE:** Read this file FIRST before starting any task. Update it after every task.
> This is the persistent memory so context is never lost between sessions.

---

## PROJECT OVERVIEW

MotoLink is a motorcycle shop marketplace/full-stack app.
- **Frontend:** React + TypeScript + Vite, Tailwind CSS, framer-motion, Recharts, Leaflet
- **Backend:** Supabase (Postgres + Auth + Storage), REST via supabase-js
- **AI:** Groq API (`llama-3.3-70b-versatile`) powers customer + admin chatbots
- **Email:** SendGrid API
- **Repo:** `ZacharyFuertes/MotoLink`, branch `main`

**Roles:** customer, owner, mechanic, admin
**Multi-tenant:** each owner has a `shop_id`; all shop data scoped by it.

---

## CREDENTIALS / CONFIG

- Supabase project ref: `hrrjdeamvwncssaczqvz`
- URL: `https://hrrjdeamvwncssaczqvz.supabase.co`
- Keys live in `.env.local` (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)
- DB password: `Moto-Link123456` — NOTE: direct Postgres connection fails (host is IPv6-only, unreachable from this machine). Use REST API instead.
- Admin account: `admin@motolink.com` / `MotolinkAdmin123!` — UUID `cea04e43-44dc-4e35-b3c1-ef5ffc776193`, role `admin` in `auth.users` + `public.users`

---

## LIVE DATABASE (16 tables)

`users, shops, vehicles, services_pricing, parts, products, featured_products, appointments, job_orders, job_order_items, invoices, part_sales, reservations, mechanic_availability, notifications, customer_notification_settings`

- `customers` table was DROPPED; 7 FKs re-pointed to `users(id)`
- `services_pricing` now has `shop_id` (nullable, FK → shops, ON DELETE CASCADE)
- `mechanic_availability` now has `shop_id` (nullable, FK → shops, ON DELETE CASCADE)
- Admin RLS policies applied across all tables (`supabase/admin_rls.sql`)

---

## DOCUMENTATION FILES (in repo root)

| File | Purpose |
|------|---------|
| `MEMORY.md` | **THIS FILE** — persistent brain, read first |
| `Info for DFD lvl 1.md` | Full Level 1 DFD: 7 entities, 7 processes, 16 stores, 73 flows |
| `MOTOLINK_ERD_SCHEMA.sql` | Clean 16-table ERD-ready schema (matches live DB) |
| `COMPLETE_DATABASE_SCHEMA.sql` | Aspirational 25+ table schema (many tables NOT in live DB) |
| `supabase/schema.sql` | 16-table schema matching live DB |
| `audit.md` | Multi-tenant migration audit findings |
| `MotoLink DFD Level 1 (Simplified).md` | Plain-text (no diagrams) simplified DFD for AI prompts |

---

## COMPLETE TASK HISTORY (chronological)

### PRE-SESSION WORK (done before memory file existed — carried in from prior context)
1. **Supabase setup** — connected project, configured keys, `.env.local`
2. **Admin dashboard** — built `AdminPlatformDashboard.tsx` as Materio-style layout wrapper (persistent sidebar/header), restyled all 7 sub-pages dark → light theme, admin RBAC on owner pages
3. **Role-based routing** — `rolePagesMapping` in `roleAccess.ts` (admin → admin-dashboard, owner → dashboard)
4. **Dropped `customers` table** — live DB migration, 7 FKs re-pointed to `users(id)`
5. **Schema docs** — created COMPLETE_DATABASE_SCHEMA.sql, supabase/schema.sql, MOTOLINK_ERD_SCHEMA.sql
6. **DFD doc** — created `Info for DFD lvl 1.md` (66 flows at the time)
7. **Migration audit** — created `audit.md`

### TASK: Fix admin_rls.sql (P2 crash bug + schema gaps)
- Removed 3 lines from `supabase/admin_rls.sql` referencing dropped `customers` table (was lines 53-55)
- File now applies admin RLS cleanly

### TASK: Owner signup flow (P5)
- `OwnerLoginPage.tsx` — added signup tab:
  1. `supabase.auth.signUp(email, password)`
  2. INSERT into `shops` with `owner_id`
  3. INSERT into `users` with `shop_id` = new shop id
  4. Auto-login
- This is the ONLY path that creates a shop (no admin approval)

### TASK: Owner dashboard (P6)
- Created `src/pages/Dashboard.tsx` — 5 metric cards (today's revenue, pending appts, customers, low stock, products) + pending appointments list + low stock alerts
- All 6 queries scoped by `user.shop_id`
- Route added in `App.tsx`

### TASK: shop_id filters across app (P4/P7)
- `AppointmentCalendarPage.tsx:92-93` (appts scoped for owner), `:140-141` (mechanics), `:342` (insert with shop_id)
- `AdminMechanicAvailability.tsx:71-72` (mechanics scoped)
- `CustomersListPage.tsx:57-58, 72, 80, 88` (customers, appts, job orders, reservations-via-parts)
- `UpdatePartsPage.tsx:75-76, 96, 206` (parts, today's sales, insert)
- `AddMechanicModal.tsx` (getMechanics(shopId), createMechanicAccount assigns shop_id)
- `AIChatModal.tsx` (fetchShopContext scoped by shopId)

### TASK: Crash bug fix (P2)
- `AIChatModal.tsx:110` — `.from("customers")` → `.from("users")` (customers table no longer exists)

### TASK: Dead code removal (P8)
- `shopService.ts` — removed `demoShops` fallback (returns `[]`)
- `supabaseClient.ts` — removed `getUsers()`, `getParts()`, `getAppointments()`
- `FeaturedSection.tsx` (in Index.tsx) — removed localStorage booking pattern
- `Navbar.tsx` + `SystemNavbar.tsx` — JBMS → "MotoLink" branding
- KEPT: `SERVICE_TYPES` + `defaultProducts` as fallbacks
- `demoShops.ts` file still exists but is now UNUSED (still contains "JBMS(JOEYBOY MOTORCYCLE SHOP)")

### TASK: Schema migration SQL (P3)
- Created `supabase/migrations/20260730_add_shop_id_to_services_and_availability.sql`
- Adds nullable `shop_id` to both tables + indexes
- Documents 3 backfill options (A: leave NULL, B: default shop, C: JOIN from users.shop_id)

### TASK: Run migrations + verify (user ran SQL)
- Verified via REST API:
  - `services_pricing.shop_id` exists ✅
  - `mechanic_availability.shop_id` exists ✅
  - All 10 tables readable via service_role ✅
  - `npm run build` passes (0 errors, 2800 modules) ✅

### TASK: Delta analysis (DFD + ERD comparison)
- Compared migration changes against existing docs
- Result: process scope changes, 7 new flows (F67-F73), ~13 altered flows, 5 removed flows, 2 ERD column additions
- Identified remaining gaps: AdminServicesPage, BookAppointmentModal, AdminMechanicAvailability lack shop_id filters

### TASK: Git push
- Commit `75183d0` on `main` — 20 files, +1148/-268
- Had to `git pull --rebase` first (remote had new commits)
- Pushed successfully

### TASK: Update documentation files
- `MOTOLINK_ERD_SCHEMA.sql` — added `shop_id` to services_pricing + mechanic_availability + indexes
- `Info for DFD lvl 1.md` — updated all 7 processes, 16 stores, expanded to 73 flows, documented owner dashboard + signup flow

### TASK: Simplified DFD
- Created `MotoLink DFD Level 1 (Simplified).md`
- First version had ASCII diagrams; user asked to remove all illustrations
- Rewrote as pure plain-text logic (entities, processes, stores, flows, isolation rules, signup sequence, file map)

### TASK: Memory file (THIS)
- Created `MEMORY.md` as persistent brain — read first every session

### TASK: BookAppointmentModal shop_id filter
- `BookAppointmentModal.tsx:253-259` — `fetchServices()` now guards `if (!defaultShopId) return;` and filters `.eq("shop_id", defaultShopId)` matching `fetchAvailableParts()` pattern
- No other functions in file touched
- **NEW ISSUE DISCOVERED:** `src/pages/MotolinkLanding.tsx` has 3 unused imports (`ArrowRight`, `CheckCircle2`, `MapPinned`) that break `tsc` — came from remote commit `9382c9b navbar`, NOT from this change. NOT yet fixed.

### TASK: "Go all" queued-prompts batch (14-item todo list)
1. **BookAppointmentModal default-shop-id fix** — removed `shopIdToUse = "default-shop-id"` fallback; now `setErrorMsg` + block when no valid shop_id; reset `mechanicAvailability` on close; availability shown when schedule exists OR bookings exist
2. **demoShops deletion** — deleted `src/data/demoShops.ts`, `jbms.png`, `pworks.jpg`, `kec.jpg`; KEPT `Motolink.svg` (used by Footer/Navbar/LoginChoice); fixed stale comment in `ShopMap.tsx:57`
3. **AdminMechanicAvailability fixes** — availability SELECT scoped via `mechanicIds` in-filter; INSERT includes `shop_id: user?.shop_id || null`; `day_of_week` stored as INTEGER (`daysOfWeek.indexOf(...)`) — page previously inserted day-name strings (latent bug, DB column is int 0-6); type widened to `number | string`; display maps int→name
4. **BookAppointmentModal slot computation** — added `mechanicAvailability` state + `fetchMechanicAvailability()` (`.eq("mechanic_id",...).eq("day_of_week", dayIdx)` with `dayIdx=(getDay()+6)%7`); `isSlotAvailable()` = time within schedule bounds, no schedule → open; grid uses `isBooked = bookedSlots.includes(time) || !isSlotAvailable(time)`
5. **UpdatePartsPage scoping** — CONFIRMED already scoped (Today's Sales `.eq("shop_id",...)` at `:96`); no fix needed
6. **Shop detail page** — created `src/pages/ShopDetailPage.tsx` (shop info + services + mechanics + products, all shop-scoped); added `getShopById` to `shopService.ts`; wired "View shop" via `onViewShop` prop through `ShopCard → ShopGallery → MotolinkLanding`; App.tsx uses `viewingShopId` overlay state in BOTH unauthenticated + authenticated landing branches (no roleAccess change needed)
7. **Appointment status alignment (latent DB bug)** — DB CHECK allows only `pending,confirmed,in_progress,completed,cancelled`; app used `ready_for_finalization` (would VIOLATE constraint). Replaced `ready_for_finalization` → `in_progress` in `types/index.ts`, `AppointmentCalendarPage.tsx`, `MechanicDashboard.tsx`, `SENDGRID_SETUP.md`. Live `appointments`/`job_orders` tables confirmed empty via REST
8. **Job order handoff** — created `src/services/jobOrderService.ts` (ensure/get/logLabor/addPartUsed/completeJobOrder/getJobOrderById) + `src/components/JobOrderModal.tsx` (labor hours/rate logging + parts used picker, no stock deduction). `AppointmentCalendarPage`: auto-creates job order when status → `confirmed`/`in_progress`; completes job order at owner finalize; "Job Order" button on owner cards
9. **Invoice generation** — created `src/services/invoiceService.ts` (createInvoiceForJobOrder idempotent per job_order_id, getInvoicesForCustomer, markInvoicePaid). Wired into finalize path in `AppointmentCalendarPage`. Customer view already exists in `ServiceHistoryModal.tsx` (line ~398). NOTE: `invoices` DB table has NO tax/subtotal/due_date/issued_date columns — TS `Invoice` type is aspirational; inserts use DB columns only
10. **Low-stock list** — FIXED bug in `inventoryService.getLowStockParts` (was `.lte('quantity_in_stock','reorder_level')` comparing to STRING literal — PostgREST can't do column-to-column; now fetch-then-filter client-side). Built `src/pages/LowStockPage.tsx` (restock action via `updatePartStock`); registered as `low-stock` AppPage for owner+admin; added to `roleAccess.ts`, `App.tsx` (admin layout + main layout), admin sidebar, SystemNavbar
11. **Reservation flow** — created `src/services/reservationService.ts` (create/getMy/getShop/updateStatus/fulfillReservation-deducts-stock). `BrowsePartsPage`: customer "Reserve Part" button + qty stepper in detail modal + "My Reservations" panel (statuses). `CustomersListPage`: owner/admin reservations panel with Confirm/Fulfill/Cancel actions. NOTE: `reservations` table has NO shop_id — scoping is via `parts.shop_id` join
12. **Owner dashboard reports** — `Dashboard.tsx`: 30-day revenue trend (part_sales + completed job_orders daily, Recharts BarChart) + per-mechanic productivity (completed job orders grouped, name lookup via users join)
13. **Build verification** — `npm run build` passes (tsc + vite, 2812 modules)
14. **TS JobOrder type** — added `total_cost?`, widened status union to match DB (`pending`/`billed`)

### TASK: Split Owner/Admin login into two portals (A-E)
- **AUDIT:** `OwnerLoginPage.tsx` accepted both `owner` + `admin` (line 136) yet was admin-styled (adminIcon, "Admin Login Failed", red theme); `LoginChoicePage.tsx` had one combined "Owner/Admin" tile; no separate admin page existed
- **B: `src/pages/ShopOwnerLoginPage.tsx`** — byte-for-byte copy of the old page's auth + signup/shop-creation logic; re-branded: lucide `Store` icon (replaces adminIcon), violet theme, "Shop Owner Login Failed"; role check now ONLY accepts `owner`; admin gets "Wrong Portal → use the Admin Portal" message
- **C: `src/pages/AdminLoginPage.tsx`** — login-only (NO signup), red admin branding (adminIcon, "Admin Login Failed"); role check only accepts `admin`; owner rejected with "use the Shop Owner Portal" message
- **D: Wiring** — `LoginChoicePage.tsx`: single tile split into "Shop Owner" (Store icon, violet) + "Platform Admin" (ShieldCheck icon, red); grid `md:grid-cols-3` → `md:grid-cols-2`; new `onChooseAdmin` prop. `App.tsx`: `LoginType` union gained `"admin"`; `onChooseAdmin` → `setCurrentLoginType("admin")`; admin branch renders `AdminLoginPage`; else-branch renders `ShopOwnerLoginPage`
- **E: Cleanup** — grep confirmed no `src` imports of the old page (only its own decl + historical docs); DELETED `src/pages/OwnerLoginPage.tsx`
- **Verify:** `npx tsc --noEmit` clean + `npm run build` passes (2813 modules)
- NOTE: docs (`audit.md`, `Info for DFD lvl 1.md`, `MotoLink DFD Level 1 (Simplified).md`) still reference `OwnerLoginPage.tsx` as historical file paths

### TASK: Redesign LoginChoicePage — tiers, neutral cards, Register shop action
- `LoginChoicePage.tsx` rewritten: two labeled tiers ("Public access" → Customer/Mechanic; "Business and admin — verified access" → Shop Owner/Platform Admin); all four cards now ONE neutral style (`bg-slate-50`, `border-slate-200`, slate-600 icons) — per-role accent colors (green/blue/purple/red) removed
- Lock badges only on business tier: "Secured" (Shop Owner) + "Restricted" (Platform Admin), 11px, top-right
- Shop Owner card is now a `motion.div` with two visible buttons: "Log in" (→ login) and "Register shop" (→ signup mode); the other 3 cards stay whole-card `<button>`s
- `ShopOwnerLoginPage.tsx`: new `initialIsSignup?: boolean` prop seeds `useState(initialIsSignup)` — no auth logic changed
- `App.tsx`: `LoginType` union gained `"owner-signup"`; `onChooseRegister` → `setCurrentLoginType("owner-signup")`; new branch renders `ShopOwnerLoginPage` with `initialIsSignup={true}` (mirrors existing `customer-signup` pattern)
- `DatabaseStatus.tsx`: status dot is now a white pill (`bg-white/90`, border, rounded-full) with an adjacent text label — "System online" / "Checking connection…" / "Connection error" (dot rendered on all 4 App layouts)
- `npx tsc --noEmit` clean + `npm run build` passes

### TASK: Flat neutral redesign of all auth screens
- Audit: only 4 files need restyling — `LoginPage.tsx` (customer), `MechanicLoginPage.tsx`, `ShopOwnerLoginPage.tsx`, `AdminLoginPage.tsx`. NO auth modals exist (glob found none). `LoginChoicePage.tsx` already neutral → excluded
- Design applied to all 4: white flat bg (already done), removed decorative blur blobs, dark gradient card → `bg-white border-slate-200 shadow-sm` (removed inline `linear-gradient`/`backdropFilter` + inner glow divs), icon tile → `bg-slate-100` with muted PNG icon (`brightness-0 opacity-60`) or `text-slate-500` lucide, headline `text-slate-900` sentence-case, inputs → light (`bg-white border-slate-300`, muted `text-slate-400` icons), primary buttons → solid `bg-slate-900 hover:bg-slate-800` (no gradient), toggle links/divider slate-toned
- Content/copy preserved EXCEPT `"Open Your Shop"` → `"Open your shop"` (sentence case)
- Status-pill collision fix: Home button moved `top-6 right-6` → `bottom-6 right-6` on all 4 login pages so it no longer overlaps the `DatabaseStatus` pill (top-right)
- LoginPage make/model suggestion dropdowns restyled light (`bg-white`, `hover:bg-slate-50`)
- Final grep: no gradients / no all-caps headlines in any login page (only intentional `uppercase` tier labels in LoginChoicePage); `tsc --noEmit` clean + `npm run build` passes (2813 modules)

### TASK: Fix 401 on shop registration
- **Root cause (3 parts):**
  1. **RLS:** live `shops` table had only "Anyone can browse active shops" (SELECT) + admin policies — NO INSERT policy → PostgREST 401 on `.insert().select("id")`
  2. **Email confirmation:** project has "Confirm email" ENABLED (verified — signup hits `over_email_send_rate_limit` trying to send confirmation). `signUp()` returns NO session → profile/shop inserts run as anon → 401. App code (AuthContext + ShopOwnerLoginPage) signs in immediately after signup → designed for autoconfirm
  3. **Schema:** live `shops` requires `slug`, `latitude`, `longitude` NOT NULL; signup insert provided none (would 400 after RLS passes). `slug` only used for display in AdminPlatformDashboard (`s.slug`), not routing
- **Client fix (`ShopOwnerLoginPage.tsx`):** generates `slug` (slugify shop name + 5-char random suffix); `address`/`city` fall back to `""` (NOT NULL, form marks them optional); clear error if `authData.session` is null ("confirm your email then sign in") instead of cryptic 401
- **SQL migration `supabase/migrations/20260731_owner_signup_rls_and_nullable_coords.sql`:** lat/lng DROP NOT NULL; INSERT policies for `shops` (`WITH CHECK owner_id = auth.uid()`), `users` (`auth.uid() = id`), `vehicles` (`customer_id = auth.uid()`); owner SELECT own shop
- **`schema.sql` updated** — lat/lng now nullable (matches migration)
- **USER MUST DO (not doable via API):** (1) run the migration in Supabase SQL Editor; (2) disable "Confirm email" in Dashboard → Authentication → Email (autoconfirm)
- Customer signup has the same latent anon-insert issue (AuthContext.signup) — fixed by same RLS + autoconfirm changes
- `tsc --noEmit` clean

### TASK: Owner portal scoping + shop profile editor
- **BUG FOUND:** owner tools rendered EMPTY in main App layout — `isAdminLayout` only matched `admin` role, and the fallback layout only rendered `dashboard`/`mechanic-portal`/`mechanic-dashboard`/`browse-parts`/`low-stock`. So owner navigation to Inventory/Appointments/Customers/Services/Mechanic Availability/Settings showed a blank `<main>`
- **FIX (`App.tsx`):** added render cases for `inventory`, `update-parts`, `appointments`, `customers`, `services`, `mechanic-availability`, `settings`, `shop-settings` in the main (non-admin) layout so owners get them via `SystemNavbar`; admins still short-circuit through `AdminPlatformDashboard`
- **`roleAccess.ts`:** new AppPage `"shop-settings"` added to `owner` only
- **`SystemNavbar.tsx`:** new "Shop Profile" menu item (`Store` icon) for owner
- **`shopService.ts`:** added `updateShop(shopId, updates)` — writes name/slug/logo_url/description/address/city/lat/lng/phone/email/specialties/operating_hours/is_active, returns refreshed Shop
- **`src/pages/ShopSettingsPage.tsx` (NEW):** owner-only page loading their shop via `getShopById(user.shop_id)`; form for identity, location/contact, specialties (comma list → text[]), operating hours, plus "Public listing" toggle (`is_active`); saves via `updateShop`; shows "No shop linked" state when `user.shop_id` is missing. Changes feed `getPublicShops` → landing + `getShopById` → ShopDetailPage
- **`SettingsPage.tsx`:** added "Shop Profile" card (owner only) → navigates to `shop-settings`
- **`AdminServicesPage.tsx` shop-scoping (confirmed live DB gap):** REST-verified `services_pricing` HAS `shop_id` (migration applied live). fetch → `.eq("shop_id", user.shop_id)` for owners (admin stays global); upsert now includes `shop_id` for owners and OMITS the client-generated `service_${Date.now()}` id on new rows (was a latent UUID violation — id column is UUID, string id would 400); delete scoped by shop_id for owners
- **`supabase/schema.sql`:** synced `services_pricing` + `mechanic_availability` to include nullable `shop_id` + indexes (were missing despite live DB + migration having them)
- **Verify:** `npx tsc --noEmit` clean + `npm run build` passes (2814 modules)

### TASK: Role-gated signup, owner dashboard shell, live shop info, post-registration redirect
- **Root cause of "owner registered as customer":** auth-race. On `signUp()` (autoconfirm), the `onAuthStateChange` listener fires `setUserProfileFromSession` which, when `public.users` row not found yet (PGRST116), auto-inserted a **`customer`** profile. The signup handler then tried `.insert()` of the owner profile → duplicate-key failure OR (if the handler won) still raced. Net effect: shop owner account had role `customer` and/or registration failed
- **Fix (`AuthContext.tsx` + `ShopOwnerLoginPage.tsx`):** listener auto-create now uses `upsert(..., { onConflict: "id", ignoreDuplicates: true })` (never clobbers); `AuthContext.signup` customer profile uses `upsert({ onConflict: "id" })`; owner signup profile uses `upsert({ onConflict: "id" })` (merge → forces `role: "owner"` + `shop_id`) PLUS a corrective `update({ role: "owner", shop_id })` after shop insert. Owner role is now deterministic
- **Role labels:** `getRoleLabel()` added to `roleAccess.ts` (owner → "Shop Owner", admin → "Platform Admin"); `SystemNavbar` + owner shell header display the label instead of raw role. Internal role value stays `owner` (DB/RLS/checks depend on it — NOT renamed to "Shop_Owner")
- **Post-registration/login redirect (`App.tsx`):** `handleLoginSuccess` is now role-aware — owner → `dashboard`, mechanic → `mechanic-dashboard`, customer → `landing` (previously everyone → landing + effect redirect)
- **`src/pages/OwnerPlatformDashboard.tsx` (NEW):** sidebar dashboard shell mirroring `AdminPlatformDashboard` (collapsible sidebar + mobile overlay + sticky header), violet accent ("MOTO SHOP"); owner nav: Dashboard, Shop Profile, Inventory, Update Parts, Appointments, Customers, Services, Manage Mechanics, Low Stock, Settings; embeds the existing `Dashboard` component on the dashboard page; access-guard `role !== "owner"` → Access Denied
- **Live shop info:** owner dashboard shows a "Live Shop Info" card fetching the shop via `getShopById(user.shop_id)` — same source the landing page uses — with logo/name/address/active pill/specialties/description, "Edit Shop Info" button → `shop-settings`; subscribes to a realtime channel on `shops` filtered by the owner's shop_id so edits reflect instantly
- **`App.tsx` wiring:** `ownerLayoutPages` list + `isOwnerLayout` block renders `OwnerPlatformDashboard` wrapping all 9 owner pages (dashboard embedded); AccessDenied path for owners now renders inside the owner shell; owners no longer use `SystemNavbar`
- **Light-theme consistency:** `ShopSettingsPage.tsx` + `SettingsPage.tsx` restyled from dark (`#0f0f0f`) to light (`#f5f5f5` bg, white cards, violet accents) to match the owner shell (other embedded pages already light: Inventory/Dashboard/AdminServices/AdminMechanicAvailability)
- **Verify:** `npx tsc --noEmit` clean + `npm run build` passes (2814 modules)

### TASK: Fix 406 on shop registration + owner-becomes-customer (auth-race round 2)
- **Live DB diagnostics (REST, anon + fresh auth token):** `users` insert → 201, `shops` insert (name/slug/description/address/city/phone/email/owner_id/is_active) → 201, `users` upsert `role:"owner"` on_conflict=id → 200 with `role:"owner"`. **The 20260731 migration IS applied live; RLS INSERT policies + autoconfirm all work** — the server side was never the problem this time
- **Real root cause (client race):** the `onAuthStateChange` listener fires `setUserProfileFromSession` during `signUp` → auto-creates a `customer` profile. That auto-create used `upsert(..., { ignoreDuplicates: true }).select().single()` → **406 when the ignored insert returns 0 rows**. The stale `customer` user object from the same race then drove the redirect/Wrong Portal/UI role → owner appeared as customer
- **Fix (`AuthContext.tsx`):** `setUserProfileFromSession` now uses `.select().maybeSingle()` (returns `null` instead of throwing 406 when ignoreDuplicates skips) and returns `Promise<User | null>`; `login()` now `await`s `setUserProfileFromSession(...)` so `user` reflects the real DB role when login resolves; `refreshUser()` returns the fresh profile
- **Fix (`ShopOwnerLoginPage.tsx`):** both login and signup paths `await refreshUser()` + reset `roleCheckedRef` before judging the portal; the role-check effect does a ONE-TIME re-fetch before showing "Wrong Portal" (previously it could sign out a valid owner whose role was merely stale); `shops` insert changed `.select("id").single()` → `.maybeSingle()` (no 406 on skipped insert) with an explicit "RLS INSERT policy missing" error message
- **Remaining `.single()` calls** (getById fetches in customer/inventory/jobOrder/invoice/reservation/shop/product services) are legit — row expected to exist
- **Verify:** `npx tsc --noEmit` clean + `npm run build` passes (2814 modules)
- **STILL NEEDS MANUAL BROWSER TEST:** register a new shop → expect role `owner` + straight to the owner dashboard, no 406 in console

### TASK: THE REAL BUG — FK race on shop registration (owner still ends up customer)
- **User reported registration still fails with an error and accounts end up `customer`.** DB query showed both real attempts (`beloy123@gmail.com`, `jbmshop@gmail.com`) had `role=customer` AND `shop_id` empty; the `shops` table had NO shop owned by either → the shop INSERT itself was failing
- **Reproduced via REST with a fresh signup token:** shop insert → **409 `23503` "Key is not present in table users" (shops_owner_id_fkey)**. The app created the SHOP BEFORE the `users` row existed. `shops.owner_id → users(id)` is a hard FK; the signup handler only upserted the owner profile AFTER the shop insert, and the auth listener's async profile-create usually loses that race → shop insert 409 → "Registration failed" → account left as `customer`
- **Why my earlier isolated test passed:** the diagnostic happened to insert the `users` row FIRST, then shop → 201. It never reproduced the app's real interleaving
- **Fix (`ShopOwnerLoginPage.tsx` handleSignup — REORDERED):** (1) signUp → (2) `users` upsert `role:"owner"` WITHOUT `shop_id` (omitted because `users.shop_id → shops.id` must exist first) → (3) `shops` insert (FK now resolves) → (4) `users` update `{ role: "owner", shop_id: shop.id }` → (5) `login()` + `refreshUser()`
- **Proven end-to-end via REST** (fresh account, exact app order incl. `Prefer: return=representation`): users upsert OK → shop insert OK (got id) → update shop_id OK → FINAL `role=owner` + shop linked
- **Test accounts created (owners with live shops):** `diag-register-7624@test.local` / `DiagOwner123!` (Diag Test Shop); `repro-1059798197@test.local` / `ReproTest123!` (Repro Shop); `e2e-1984807849@test.local` / `E2eTest123!` (E2E Shop). The diag account's password was reset + shop linked via service role (it previously had `role=owner` but `shop_id` null)
- **Existing broken registrations:** `beloy123@gmail.com` + `jbmshop@gmail.com` are stuck as `customer` — fix via `UPDATE public.users SET role='owner', shop_id=<id> WHERE id='<uid>'` (or re-register)
- **Verify:** `npx tsc --noEmit` clean + `npm run build` passes
- **STILL NEEDS MANUAL BROWSER TEST:** register a new shop → expect role `owner` + straight to the owner dashboard

---

## CURRENT STATE

- **Build:** passes clean (`tsc` + `vite build`) ✅
- **Code:** multi-tenant migration complete; shop detail page, job orders, invoices, low-stock list, reservations, owner dashboard reports, owner sidebar shell + Shop Profile editor all built
- **Owner portal:** owners register → `role: owner` (deterministic, no customer-race); registration FK race fixed (users row created BEFORE shop insert — was 409 `shops_owner_id_fkey`); redirected straight to the new violet sidebar dashboard; own 9 tools + Shop Profile + live shop-info preview; no `SystemNavbar`
- **DB:** 20260731 migration CONFIRMED applied live (REST-verified: users/shops INSERT 201, owner-role upsert 200); RLS INSERT policies working; autoconfirm working; `services_pricing`/`mechanic_availability` confirmed to have `shop_id` live; `appointments` + `job_orders` tables confirmed empty
- **Git:** not pushed since prior push = commit `75183d0`
- **Docs:** `MEMORY.md` updated with full batch history (below)

---

## OPEN ITEMS / GAPS (still pending)

1. **Backfill decision:** existing `services_pricing`/`mechanic_availability` rows have `shop_id = NULL` — pick option A/B/C from migration file
2. **NOT NULL decision:** optional `ALTER TABLE ... SET NOT NULL` on the two new shop_id columns after backfill
3. **Runtime verification:** browser testing of cross-shop isolation not yet done (CLI can't open browser) — need manual test of Owner1/Owner2/Admin/customer flows (esp. owner signup → role owner + redirect to dashboard, no 406 in console)
4. **Reservations scoping:** `reservations` table has NO shop_id column — scoped via `parts.shop_id` join; consider a shop_id column if direct scoping needed
5. **Seed data:** no job_orders/part_sales yet (tables empty) — dashboard trend/productivity charts show empty states until real data exists
6. **~~Owner signup still needs user action~~** — 20260731 migration CONFIRMED applied live + autoconfirm working; no further user action needed
7. **Existing wrong-role users:** `beloy123@gmail.com` + `jbmshop@gmail.com` were created as `customer` by the FK-race bug (no shop either) — fix in DB (`UPDATE public.users SET role='owner', shop_id=<id> WHERE id='<uid>'`) or re-register

---

## VERIFICATION COMMANDS

- Build: `npm run build` (runs `tsc && vite build`)
- Type-check only: `npx tsc --noEmit`
- REST test (PowerShell):
  ```powershell
  $headers = @{apikey=$anonKey; Authorization="Bearer $anonKey"}
  Invoke-RestMethod -Uri "$url/rest/v1/services_pricing?limit=1" -Headers $headers -Method Get
  ```
  (Keys from `.env.local`; anon key and service role key differ — use the exact strings from the file)

---

## LESSONS / CONVENTIONS

- PowerShell 5.1 has NO `-SkipCertificateCheck` flag — don't use it
- `head`/`tail`/`&&` don't work in PowerShell — use `Select-Object`/full commands
- Keys in `.env.local` are the source of truth (session context copies were stale/mangled)
- `.env.local` file has encoding issues with comments (UTF-8 comments render as `??`), but key VALUES are fine
- Always verify live DB state via REST API (direct Postgres is unreachable)
- When user says "test it", they mean: verify DB schema via REST + run `npm run build`
- When user says "push", commit all staged changes with a descriptive message then `git pull --rebase` then push
- Docs updates must trace to real file paths + line numbers, never guesses
