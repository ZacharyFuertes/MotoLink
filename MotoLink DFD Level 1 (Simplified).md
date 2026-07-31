# MotoLink — Level 1 DFD (Simplified)

---

## EXTERNAL ENTITIES

1. Customer — browses shops, books appointments, chats with AI, buys parts
2. Shop Owner — runs a shop, manages inventory/appointments/services/mechanics/products
3. Mechanic — views assigned jobs, updates appointment status, sets availability
4. Platform Admin — sees everything across all shops, views analytics
5. SendGrid API — sends email notifications
6. Groq AI API — powers the chatbot
7. Supabase Auth — handles login, signup, session management

---

## CORE PROCESSES

1. Auth & User Management — login, signup, profile, roles, mechanic creation, owner signup includes shop creation
2. Shop & Catalog — shop CRUD, service pricing, products, featured items, owner dashboard with metrics
3. Appointment & Job Management — book appointments, calendar view scoped by shop, status tracking, job orders, auto stock deduction on completion
4. Inventory & Sales — parts CRUD, POS checkout, stock adjustment, customer list with spending history, all scoped by shop
5. AI Chat Assistant — customer chat fetches context scoped by shop, admin chat is cross-shop, can book appointments via tool calls
6. Notification System — sends email via SendGrid, checks opt-out preferences, logs to audit store
7. Admin Analytics Dashboard — aggregates all shops data, groups by shop_id for per-shop breakdown

---

## DATA STORES

1. Users — all profiles (customers, owners, mechanics, admin)
2. Shops — shop info, location, contact, owner_id
3. Services (services_pricing) — service menu per shop, has shop_id
4. Parts — inventory per shop, has shop_id
5. Products — shop products for sale, has shop_id
6. Appointments — bookings with status/dates/pricing, has shop_id
7. Job Orders — work orders linked to appointments, has shop_id
8. Part Sales — POS checkout records, has shop_id
9. Vehicles — customer vehicles
10. Notifications — email audit log
11. Reservations — walk-in/hold orders
12. Mechanic Availability — mechanic schedules per shop, has shop_id
13. Invoices — billing records
14. Customer Notification Settings — opt-out preferences

---

## KEY DATA FLOWS (WHAT MOVES WHERE)

### Signup & Login
- Credentials from external entity go to Auth & User Management
- Auth & User Management creates user in Users table
- If owner signup, also creates row in Shops table and sets shop_id on the user
- Auth returns session token to the entity

### Owner Dashboard (new process under Shop & Catalog)
- Owner Dashboard reads today's part_sales scoped by shop_id
- Reads pending appointments count scoped by shop_id
- Reads customer count from Users scoped by shop_id
- Reads low stock parts from Parts scoped by shop_id
- Reads product count from Products scoped by shop_id
- All 5 queries are parameterized by the logged-in owner's shop_id
- Returns metrics to the owner

### Appointment Booking
- Customer browses shops/services/products from Shop & Catalog
- Customer submits booking to Appointment & Job Management
- Appointment & Job Management creates appointment in Appointments with shop_id
- Checks mechanic availability before booking
- On completion, triggers notification via Notification System

### Inventory & POS
- Owner adds/edits parts in Inventory & Sales, scoped by shop_id
- Owner checks out parts, creates Part Sale with shop_id
- Today's sales query is scoped by shop_id
- Customer list and spending history queries are scoped by shop_id

### AI Chat
- Customer chat gathers context from Parts, Products, Users (mechanics), Mechanic Availability — all scoped by shop_id
- Admin chat gathers data across all shops (no shop filter)
- Both send user message to Groq API and stream response back

### Notifications
- Triggered by appointment completion
- Checks opt-out preference in Customer Notification Settings
- Sends email via SendGrid
- Logs result to Notifications store

### Admin Analytics
- Admin dashboard loads, queries all Users, Shops, Appointments, Job Orders, Part Sales
- Groups data by shop_id for per-shop breakdown
- Returns aggregated metrics to admin

---

## MULTI-TENANT ISOLATION RULES

Every shop-owners data is isolated by shop_id. The rules are:

- When an owner logs in, their user profile has a shop_id
- All queries the owner triggers append `.eq("shop_id", user.shop_id)` to filter results
- Tables that have their own shop_id column: Users (mechanics/customers), Parts, Products, Appointments, Part Sales, Job Orders, Services, Mechanic Availability
- Reservations don't have shop_id directly, so filtering joins through Parts (parts.shop_id)
- Admin bypasses all shop_id filters and sees everything across all shops
- Customers see only their own data (filtered by customer_id, not shop_id)
- The public browse pages (shop list, parts browse) return global data with no shop filter

### Gap: Services and Mechanic Availability have the shop_id column in the database, but the frontend pages that manage them (AdminServicesPage, BookAppointmentModal, AdminMechanicAvailability) do not yet apply the shop_id filter.

---

## SHOP OWNER SIGNUP SEQUENCE

1. Owner fills form with email, password, name, shop name, shop description, shop address, shop city, shop phone
2. System calls Supabase Auth signUp with email + password
3. System inserts into Shops table with owner_id set to the new auth user's id
4. System inserts into Users table with id matching auth user, role='owner', shop_id set to the new shop's id
5. System auto-logs the owner in

---

## FILE-TO-PROCESS MAP

- Auth & User Management: AuthContext.tsx, OwnerLoginPage.tsx, LoginPage.tsx, AddMechanicModal.tsx
- Shop & Catalog: shopService.ts, AdminServicesPage.tsx, AdminProductsPage.tsx, FeaturedSection.tsx, Dashboard.tsx
- Appointment & Job Management: AppointmentCalendarPage.tsx, BookAppointmentModal.tsx, MechanicDashboard.tsx, MechanicPortal.tsx
- Inventory & Sales: inventoryService.ts, UpdatePartsPage.tsx, BrowsePartsPage.tsx, CustomersListPage.tsx
- AI Chat Assistant: AIChatModal.tsx, AdminChatbot.tsx
- Notification System: notificationService.ts, sendgridClient.ts, NotificationPreferencesModal.tsx
- Admin Analytics: AdminPlatformDashboard.tsx
