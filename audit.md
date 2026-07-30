# Multi-Tenant Migration Audit — MotoLink

> Audit only — no changes made. All findings are read-only.

---

## STEP 1 — Schema vs Frontend Gap Check

### Old Table Name Mismatches

**None found.** The code consistently uses the current 16-table naming convention (`appointments`, `vehicles`, etc.). All 19 extra tables in `COMPLETE_DATABASE_SCHEMA.sql` that don't exist in the live DB are simply unreferenced in frontend code.

### Table-Level Gaps (7 total)

| # | Table | Issue | Files Affected |
|---|-------|-------|----------------|
| G1 | `customers` | **Table dropped from live DB** — only reference remains in frontend | `src/components/AIChatModal.tsx:110` — `.from("customers")` will throw "relation does not exist" at runtime |
| G2 | `services_pricing` | **No `shop_id` column** in schema — services are global, not per-shop. `BookAppointmentModal` fetches all active services across all shops. | `src/pages/AdminServicesPage.tsx` (CRUD, no shop filter), `src/components/BookAppointmentModal.tsx:255` (read, no shop filter) |
| G3 | `mechanic_availability` | **No `shop_id` column** in schema — availability data is global, not per-shop | `src/pages/AdminMechanicAvailability.tsx` (CRUD, no shop filter), `src/components/AIChatModal.tsx:77` (read, no shop filter) |
| G4 | `users` | Shop-owner/mechanic queries lack `shop_id` filter across 6 files. `AddMechanicModal` creates mechanics **without assigning `shop_id`**. | `src/pages/AppointmentCalendarPage.tsx` (mechanics fetch), `src/pages/AdminMechanicAvailability.tsx` (mechanics fetch), `src/pages/CustomersListPage.tsx` (customers fetch), `src/components/AddMechanicModal.tsx` (mechanics fetch + insert), `src/components/AIChatModal.tsx` (mechanics fetch), `src/components/AdminChatbot.tsx` (all users fetch) |
| G5 | `appointments` | SELECT queries lack `shop_id` filter across 8 files. INSERT queries correctly include `shop_id`. | `src/pages/AppointmentCalendarPage.tsx`, `src/pages/MechanicDashboard.tsx`, `src/pages/MechanicPortal.tsx`, `src/pages/CustomerPortal.tsx`, `src/components/ViewAppointmentsModal.tsx`, `src/components/ServiceHistoryModal.tsx`, `src/pages/CustomersListPage.tsx`, `src/pages/AdminMechanicAvailability.tsx` |
| G6 | `parts` | Some queries lack `shop_id` filter. `BrowsePartsPage` intentionally shows all parts (public gallery). AI chat queries leak all shops' data. | `src/pages/BrowsePartsPage.tsx:87` (intentional public), `src/components/AIChatModal.tsx:72`, `src/components/AdminChatbot.tsx:133`, `src/pages/AppointmentCalendarPage.tsx:186` |
| G7 | `part_sales`, `job_orders`, `invoices`, `reservations` | None of these tables' SELECT queries filter by `shop_id` | Multiple pages cross-referenced (see detail below) |

### `shop_id` Filtering Detail by Table

| Table | Files with `shop_id` | Files Missing `shop_id` |
|-------|---------------------|------------------------|
| `users` | `customerService.ts:18`, `BookAppointmentModal.tsx:193` (conditional) | `AppointmentCalendarPage.tsx` (mechanics), `AdminMechanicAvailability.tsx` (mechanics), `CustomersListPage.tsx` (customers), `AddMechanicModal.tsx` (mechanics + insert), `AIChatModal.tsx` (mechanics), `AdminChatbot.tsx` |
| `parts` | `inventoryService.ts:18,37`, `BookAppointmentModal.tsx:292`, `UpdatePartsPage.tsx:76`, `MechanicDashboard.tsx:116` | `BrowsePartsPage.tsx:87` (intentional), `AIChatModal.tsx:72`, `AdminChatbot.tsx:133`, `AppointmentCalendarPage.tsx:186` |
| `products` | `productService.ts:19,136,165` | `AIChatModal.tsx:66`, `AdminChatbot.tsx:137` |
| `featured_products` | `productService.ts` (all queries) | None — fully scoped |
| `appointments` | INSERT only (`BookAppointmentModal.tsx:395`, `AppointmentCalendarPage.tsx:330`) | All SELECT queries (8 files) |
| `job_orders` | None | All 6 files that query it |
| `invoices` | None | All 3 files that query it |
| `part_sales` | INSERT only (`UpdatePartsPage.tsx`) | All SELECT queries (3 files) |
| `reservations` | None | All 2 files that query it |
| `mechanic_availability` | No `shop_id` column in schema | All queries (2 files) |
| `services_pricing` | No `shop_id` column in schema | All queries (2 files) |

---

## STEP 2 — Feature Gap Check

### Shop Owner Flows

| # | Flow | Existing Implementation | Gap |
|---|------|----------------------|-----|
| M1 | **Signup/login creating a shop record** | `OwnerLoginPage.tsx` handles login + role redirect | **No signup flow** that creates a `shops` row, sets `owner_id`, and assigns `shop_id` to the owner's `users` record |
| M2 | **Analytics dashboard** | `AdminPlatformDashboard.tsx` exists (admin-only, cross-shop). RLS not yet applied. | **Owner has no dashboard page.** Old `Dashboard.tsx` was deleted. `rolePagesMapping` points owner to `"dashboard"` but no route exists. Owner would hit a 404. |
| M3 | **Inventory management** | `InventoryPage.tsx` + `UpdatePartsPage.tsx` — CRUD with `shop_id` scoping via service layer | `UpdatePartsPage` "Today's Sales" summary fetches ALL `part_sales` globally (no `shop_id` filter) — data leak |
| M4 | **Appointment management** | `AppointmentCalendarPage.tsx` — create/update/cancel | **SELECT fetches ALL appointments globally.** No `shop_id` filter despite role-based logic. An owner sees every shop's appointments. |
| M5 | **Product listing/advertising** | `AdminProductsPage.tsx` — fully `shop_id`-scoped via `productService.ts` | None — this is the most complete feature |
| M6 | **Mechanic creation** | `AddMechanicModal.tsx` — creates `users` row with `role: "mechanic"` | **Does NOT set `shop_id`** on the new mechanic. Lists ALL mechanics globally. Mechanic is orphaned — no association to any shop. |
| M7 | **Mechanic availability management** | `AdminMechanicAvailability.tsx` — set weekly schedules | **Fetches ALL mechanics and ALL availability globally.** No `shop_id` filter on any query. An owner can see/edit mechanics from other shops. |
| M8 | **Service pricing management** | `AdminServicesPage.tsx` — CRUD on `services_pricing` | **Schema gap:** `services_pricing` has no `shop_id` column. All shops share one service menu. No per-shop customization. |

### Customer Flows

| # | Flow | Existing Implementation | Gap |
|---|------|----------------------|-----|
| C1 | **Browse shops** | `MotolinkLanding.tsx` + `ShopCard` + `ShopGallery` + `ShopMap` + `ShopFilters` | No per-shop detail page showing that shop's products + mechanics + services together |
| C2 | **View a shop's products** | `BrowsePartsPage.tsx` (public, all shops globally) | No way to browse a **specific shop's** products in isolation |
| C3 | **View a shop's mechanics** | Not implemented anywhere | No UI to see which mechanics work at a specific shop |
| C4 | **View a shop's services** | `ServicesGrid.tsx` (hardcoded static data, 6 services) | No dynamic per-shop service menu display |
| C5 | **Book a specific mechanic** | `BookAppointmentModal.tsx` — mechanic selection exists | Hardcoded `"default-shop-id"` fallback (line 370). `services_pricing` fetched globally — shows all shops' services to a customer booking at one shop. |
| C6 | **Customer portal** | `CustomerPortal.tsx` — own appointments, vehicles, invoices | Scoped by `customer_id` only — no shop awareness needed for this view |

### Platform Admin

| # | Item | Status |
|---|------|--------|
| A1 | **Cross-shop dashboard** | `AdminPlatformDashboard.tsx` — fully multi-shop aware, queries all data, per-shop breakdowns. **RLS policies NOT YET APPLIED** in Supabase (blocking real data). |
| A2 | **Cross-shop AI chatbot** | `AdminChatbot.tsx` exists but fetches ALL data with NO `shop_id` filters (intentional for admin, but any admin sees everything) |
| A3 | **Admin isolation from owner panels** | Already separate — admin has own page set (`admin-dashboard`, `admin-shops`, `admin-users`) plus access to all owner pages. `AdminPlatformDashboard.tsx` is a layout wrapper. |
| A4 | **Owner should have separate dashboard** | Yes — admin and owner panels should remain separate. Owner needs a `Dashboard.tsx` restored or rebuilt. |

---

## STEP 3 — Dead Code Candidates (10 total)

| # | File & Line | Code | Why Obsolete |
|---|-------------|------|-------------|
| D1 | `src/components/AIChatModal.tsx:110` | `.from("customers")` | `customers` table was **dropped** from live DB. 7 FK references re-pointed to `users(id)`. This will throw "relation does not exist" at runtime. |
| D2 | `src/components/Navbar.tsx:187` | Hardcoded `"JBMS MOTOSHOP"` brand text | Pre-multi-tenant brand name. Post-migration should display the actual shop name from DB or "MotoLink". |
| D3 | `src/components/SystemNavbar.tsx:199` | Hardcoded `"JBMS MOTOSHOP"` brand text | Same as D2 — duplicate legacy branding in the system navbar. |
| D4 | `src/data/demoShops.ts` (entire file) | Hardcoded demo shops: `jbms-joeyboy-motorcycle-shop`, `p-works-racing-team`, `kec-motorshop-1st-branch` | Used as fallback in `shopService.ts:27` when DB is empty/unreachable. Post-migration, shops always come from DB. |
| D5 | `src/data/demoShops.ts:1` | `import jbmsLogo from "../pictures/public/jbms.png"` | Legacy logo asset for old single-tenant brand. |
| D6 | `src/components/FeaturedSection.tsx:149-181` | localStorage-based appointment booking under key `"motoshop_appointments"` | Saves to `localStorage` instead of Supabase. Disconnected from real `appointments` table. Leftover demo code. |
| D7 | `src/services/supabaseClient.ts:54-88` | `getUsers()`, `getParts()`, `getAppointments()` — global unbounded `SELECT *` | **Never imported anywhere.** Verified by grep. All callers use dedicated service layer (`inventoryService`, `productService`, etc.) with proper filtering. |
| D8 | `src/components/BookAppointmentModal.tsx:60-97` | Hardcoded `SERVICE_TYPES` array (fallback) | Shadowed by dynamic `services_pricing` fetch at line 255. Only used if DB query fails. Post-migration dynamic services should always load. |
| D9 | `src/components/FeaturedSection.tsx:54-121` | Hardcoded `defaultProducts` array (3 products with prices, images) | Fallback when `featuredProductService.getFeaturedProducts()` returns empty. Post-migration only DB products should display. |
| D10 | `src/pages/Dashboard.tsx` | **Already deleted** (confirmed in session history) | `rolePagesMapping` still references `"dashboard"` for `owner` role. No page exists to route to. Owner hits 404 or redirect loop. |

---

## STEP 4 — Self-Check

- [x] Every gap cited references an actual file (line numbers provided where specific)
- [x] Every dead-code candidate includes a reason, not a guess
- [x] Nothing has been deleted or modified (read-only audit)

---

## Summary: Migration Completion Status

### ✅ Already Working (fully multi-tenant)
- `shops` table + `shopService.ts` public fetch
- `products` + `featured_products` fully `shop_id`-scoped (service layer)
- `parts` CRUD in `inventoryService.ts` (shop-scoped)
- `AdminPlatformDashboard.tsx` (cross-shop admin view)
- Type definitions: all relevant types include `shop_id`

### ⚠️ Partially Working (has shop_id support but gaps exist)
- `appointments`: INSERT includes `shop_id`, but SELECT doesn't filter
- `parts`: service layer scoped, but AI and public pages bypass it
- `users`: shop-scoped in `customerService.ts`, orphaned everywhere else

### ❌ Not Working / Missing
- **Owner dashboard** — deleted with no replacement
- **Owner signup/shop creation** — no flow exists
- **Mechanic creation** — no `shop_id` assigned
- **`services_pricing`** — no `shop_id` column (schema gap)
- **`mechanic_availability`** — no `shop_id` column (schema gap)
- **`customers` table reference** — dead query, will crash at runtime
- **Admin RLS policies** — exist in file but not applied to live DB

### Blockers for Real-World Use
1. **Apply RLS policies** — `supabase/admin_rls.sql` must run in Supabase SQL Editor
2. **Fix `shop_id` filters** on ~30+ SELECT queries across the codebase
3. **Add `shop_id` to `services_pricing` and `mechanic_availability`** schemas
4. **Create owner dashboard page** (replace deleted `Dashboard.tsx`)
5. **Fix mechanic creation** to assign `shop_id`
6. **Remove `customers` table reference** in `AIChatModal.tsx`
7. **Clean up 10 dead-code items** (especially D1 crash, D10 routing hole)
