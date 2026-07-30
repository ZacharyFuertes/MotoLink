# MotoLink — Level 1 Data Flow Diagram Components

---

## 1. EXTERNAL ENTITIES

| # | Entity | Code Reference | Data Sent In | Data Received Back |
|---|--------|---------------|-------------|-------------------|
| E1 | **Customer** | `AuthContext.tsx:256-310` (signup), `CustomerPortal.tsx:40-80`, `BookAppointmentModal.tsx:342-450` | credentials, profile info, vehicle details, appointment requests, part browse queries | appointment confirmations, service status updates, invoice data, vehicle list |
| E2 | **Shop Owner** | `OwnerLoginPage.tsx:60-80`, `InventoryPage/UpdatePartsPage`, `AppointmentCalendarPage.tsx:154-304`, `AdminServicesPage.tsx:35-95` | login credentials, part definitions, stock adjustments, service pricing updates, appointment status changes, product listings | dashboard metrics, inventory reports, appointment schedules, sales data, customer list |
| E3 | **Mechanic** | `MechanicDashboard.tsx:92-293`, `MechanicPortal.tsx:53-108`, `AdminMechanicAvailability.tsx:79-239` | login credentials, availability schedules, appointment status updates (start/completed) | assigned appointment list, vehicle details, job order instructions |
| E4 | **Platform Admin** | `AdminPlatformDashboard.tsx:128-160`, `AdminChatbot.tsx:106-301` | login credentials, cross-shop queries, analytics requests | aggregated user data, cross-shop revenue, inventory across all shops, platform metrics |
| E5 | **SendGrid API** | `sendgridClient.ts:31-97`, `notificationService.ts:334-400` | HTML email content, recipient address, subject line, sender identity | delivery status (success/failure) |
| E6 | **Groq API** | `AIChatModal.tsx:425-433`, `AdminChatbot.tsx:409-425` | conversation history, system prompt with business context, user query (model: `llama-3.3-70b-versatile`) | streamed AI response text (`choices[0].delta.content`) |
| E7 | **Supabase Auth** | `AuthContext.tsx:198-225` (login), `AuthContext.tsx:256-277` (signup) | email + password credentials | auth session token, user UUID, JWT for subsequent API calls |

---

## 2. LEVEL 1 PROCESSES

| # | Process | Files Implementing It | External Entities Interacting |
|---|---------|---------------------|------------------------------|
| **1.0** | **User & Authentication Management** | `AuthContext.tsx` (login/signup/logout/profile), `LoginPage.tsx:121-243` (signup form + notification prefs), `OwnerLoginPage.tsx:60-80` (owner/admin login), `customerService.ts:13-158` (customer CRUD), `AddMechanicModal.tsx` | E1 Customer, E2 Owner, E3 Mechanic, E4 Admin, E7 Supabase Auth |
| **2.0** | **Appointment & Job Order Management** | `BookAppointmentModal.tsx:342-450` (create), `AppointmentCalendarPage.tsx:87-350` (view, update status, stock deduct, trigger email), `MechanicDashboard.tsx:92-293` (view assigned, update status), `MechanicPortal.tsx:53-108` (view), `customerService.ts:94-126` (delete on customer removal) | E1 Customer, E2 Owner, E3 Mechanic |
| **3.0** | **Inventory & Parts Sales** | `inventoryService.ts:13-146` (CRUD), `UpdatePartsPage.tsx:67-270` (POS checkout, stock adjust, mark sold out), `BrowsePartsPage.tsx:86-98` (public browse), `AppointmentCalendarPage.tsx:184-210` (auto-deduct on completion) | E2 Owner, E1 Customer (browse only) |
| **4.0** | **Shop & Product Catalog** | `productService.ts:14-284` (products + featured CRUD), `shopService.ts:21-33` (public shop list), `AdminServicesPage.tsx:35-95` (service pricing CRUD), `AdminMechanicAvailability.tsx:79-239` (mechanic schedules) | E2 Owner, E1 Customer (browse shops/services) |
| **5.0** | **AI Chat Assistant** | `AIChatModal.tsx:63-433` (gather context -> query Groq -> optional appointment booking tool call), `AdminChatbot.tsx:106-425` (gather all business data -> query Groq -> stream response) | E1 Customer, E4 Admin, E6 Groq API |
| **6.0** | **Notification System** | `notificationService.ts:278-400` (log notification + send via SendGrid), `sendgridClient.ts:31-97` (HTTP call), `NotificationPreferencesModal.tsx:28-89` (preference CRUD), `LoginPage.tsx:222-243` (set default on signup) | E5 SendGrid API, E1 Customer (receives email) |
| **7.0** | **Admin Analytics Dashboard** | `AdminPlatformDashboard.tsx:128-160` (aggregate queries across shops/users/appointments/parts/job_orders/part_sales) | E4 Admin |

---

## 3. DATA STORES

Mapping to actual Supabase tables:

| # | Data Store | Read By Processes | Written By Processes |
|---|-----------|------------------|---------------------|
| D1 | **users** | 1.0 (profile lookup, role check), 2.0 (mechanics, customers), 5.0 (customer context), 7.0 (user metrics) | 1.0 (signup insert, profile update, customer CRUD), 2.0 (delete cascade) |
| D2 | **shops** | 4.0 (public shop list), 7.0 (shop metrics) | *(shop creation not currently implemented in frontend)* |
| D3 | **vehicles** | 2.0 (appointment creation), 5.0 (customer context), E1 (vehicle list) | 1.0 (signup create), 2.0 (appointment references) |
| D4 | **services_pricing** | 2.0 (price lookup), 4.0 (service listing) | 4.0 (upsert, delete) |
| D5 | **parts** | 2.0 (auto-deduct stock, check availability), 3.0 (CRUD, browse, stock check), 5.0 (shop context), 7.0 (inventory metrics) | 2.0 (stock deduct on completion), 3.0 (create, update stock, delete) |
| D6 | **products** | 4.0 (product listing), 5.0 (shop context) | 4.0 (create, update, delete) |
| D7 | **featured_products** | 4.0 (front page display) | 4.0 (add, remove, toggle, reorder) |
| D8 | **appointments** | 2.0 (all views, status checks, customer history), 5.0 (customer context, admin context), 7.0 (appointment metrics) | 2.0 (create, status update, delete on customer removal) |
| D9 | **job_orders** | 2.0 (references via appointment), 5.0 (admin chat context), 7.0 (metrics) | *(not directly written via UI)* |
| D10 | **job_order_items** | 2.0 (references via job_order) | *(not directly written via UI)* |
| D11 | **invoices** | E1 (view billing), 5.0 (context) | *(not directly written via UI)* |
| D12 | **part_sales** | 3.0 (today's sales, checkout), 5.0 (admin chat context), 7.0 (revenue metrics) | 3.0 (insert on POS checkout) |
| D13 | **reservations** | 5.0 (admin chat context) | *(not directly written via UI)* |
| D14 | **mechanic_availability** | 2.0 (slot lookup during booking), 5.0 (customer context) | 4.0 (mechanic sets availability) |
| D15 | **notifications** | 6.0 (audit log) | 6.0 (insert on send/attempt) |
| D16 | **customer_notification_settings** | 6.0 (check opt-out before sending) | 6.0 (upsert preference), 1.0 (set default on signup) |

---

## 4. DATA FLOWS

### 4A. External Entity -> Process flows

| # | Source | Destination | Data Moved | Trigger |
|---|--------|------------|------------|---------|
| F1 | E1 Customer | 1.0 User Mgmt | sign-up: `{email, password, name, phone, address, vehicle}` | Registration form submit |
| F2 | E1 Customer | 1.0 User Mgmt | log-in: `{email, password}` | Login form submit |
| F3 | E1 Customer | 2.0 Appointment Mgmt | book request: `{customer_id, shop_id, mechanic_id?, vehicle_id, service_type, scheduled_date, scheduled_time, notes, parts[], estimated_price}` | Booking form submit |
| F4 | E1 Customer | 3.0 Inventory | browse filter: `{category?, keyword?}` | Browse parts page load/filter |
| F5 | E1 Customer | 4.0 Shop Catalog | location query: `{city?, lat?, lng?}` | Landing page load |
| F6 | E1 Customer | 5.0 AI Chat | user query: `{message text, conversation history}` | Chat input submit |
| F7 | E1 Customer | 6.0 Notifications | opt-out toggle: `{user_id, email_notifications_enabled}` | Notification preferences modal |
| F8 | E2 Owner | 1.0 User Mgmt | log-in: `{email, password}` | Owner login form submit |
| F9 | E2 Owner | 2.0 Appointment Mgmt | status update: `{appointment_id, new_status, completion_notes?}` | Calendar status dropdown |
| F10 | E2 Owner | 3.0 Inventory | part definition: `{shop_id, name, sku, category, unit_price, quantity_in_stock, reorder_level}` | Add/edit part form |
| F11 | E2 Owner | 3.0 Inventory | stock adjust: `{part_id, new_quantity}` | Stock adjustment modal |
| F12 | E2 Owner | 3.0 Inventory | checkout items: `[{part_id, quantity, unit_price}], sold_by` | POS checkout button |
| F13 | E2 Owner | 4.0 Shop Catalog | service pricing: `{label, description, price, is_active}` | Services page CRUD |
| F14 | E2 Owner | 4.0 Shop Catalog | product: `{shop_id, name, description, unit_price, category, image_url}` | Products page CRUD |
| F15 | E2 Owner | 4.0 Shop Catalog | featured toggle: `{product_id, shop_id, display_order, is_active}` | Featured products management |
| F16 | E2 Owner | 4.0 Shop Catalog | mechanic availability: `{mechanic_id, day_of_week, start_time, end_time, is_available}` | Mechanic schedule form |
| F17 | E3 Mechanic | 1.0 User Mgmt | log-in: `{email, password}` | Mechanic login form |
| F18 | E3 Mechanic | 2.0 Appointment Mgmt | status update: `{appointment_id, new_status}` (limited to start/completed) | Mechanic dashboard action |
| F19 | E3 Mechanic | 4.0 Shop Catalog | availability: `{mechanic_id, day_of_week, start_time, end_time}` | Mechanic availability page |
| F20 | E4 Admin | 1.0 User Mgmt | log-in: `{email, password}` | Owner/Admin login form |
| F21 | E4 Admin | 5.0 AI Chat | admin query: `{message text}` | Admin chatbot input |
| F22 | E4 Admin | 7.0 Analytics | page load (triggers aggregate queries) | Admin dashboard navigation |
| F23 | E5 SendGrid | 6.0 Notifications | delivery receipt: `{status, message_id}` | POST response to sendgridClient |
| F24 | E6 Groq API | 5.0 AI Chat | AI response: `{choices[0].message.content}` -> streamed chunks | POST response to chat completion |
| F25 | E7 Supabase Auth | 1.0 User Mgmt | auth session: `{user_id, access_token, expires_at}` | Successful login/signup |

### 4B. Process -> Data Store flows

| # | Source | Destination | Data Moved | Operation |
|---|--------|------------|------------|-----------|
| F26 | 1.0 User Mgmt | D1 users | `{id, email, name, role, phone, address, shop_id}` | INSERT on signup / SELECT on login / UPDATE on profile edit / DELETE on account removal |
| F27 | 1.0 User Mgmt | D16 customer_notification_settings | `{user_id, email_notifications_enabled}` | UPSERT on signup (default true) |
| F28 | 1.0 User Mgmt | D3 vehicles | `{customer_id, make, model}` | INSERT on signup (optional) |
| F29 | 2.0 Appointment Mgmt | D8 appointments | `{customer_id, shop_id, mechanic_id, vehicle_id, service_type, scheduled_date, scheduled_time, description, status, notes, estimated_price, parts[], total_amount}` | INSERT on create / SELECT on view / UPDATE on status change / DELETE on customer removal |
| F30 | 2.0 Appointment Mgmt | D5 parts | `{quantity_in_stock - quantity_sold}` | UPDATE stock deduct on completion |
| F31 | 2.0 Appointment Mgmt | D3 vehicles | `{id, make, model, year}` | SELECT for context |
| F32 | 2.0 Appointment Mgmt | D1 users | `{id, name, email, phone}` | SELECT mechanics list, customer details |
| F33 | 2.0 Appointment Mgmt | D4 services_pricing | `{id, label, price}` | SELECT for pricing |
| F34 | 2.0 Appointment Mgmt | D14 mechanic_availability | `{mechanic_id, day_of_week, start_time, end_time}` | SELECT for slot availability |
| F35 | 3.0 Inventory | D5 parts | `{shop_id, name, sku, category, unit_price, quantity_in_stock, reorder_level, image_url}` | INSERT / SELECT / UPDATE / DELETE |
| F36 | 3.0 Inventory | D12 part_sales | `{part_id, shop_id, quantity_sold, unit_price, sale_price, sold_by}` | INSERT on checkout |
| F37 | 3.0 Inventory | D13 reservations | `{customer_id, part_id, status, quantity}` | SELECT for admin context |
| F38 | 4.0 Shop Catalog | D1 users | `{id, name, email, role}` | SELECT mechanics |
| F39 | 4.0 Shop Catalog | D2 shops | `{id, name, slug, logo_url, description, address, city, lat, lng, phone, email, specialties, operating_hours}` | SELECT public shops |
| F40 | 4.0 Shop Catalog | D4 services_pricing | `{label, description, icon, price, is_active}` | SELECT / UPSERT / DELETE |
| F41 | 4.0 Shop Catalog | D6 products | `{shop_id, name, description, unit_price, category, image_url}` | INSERT / SELECT / UPDATE / DELETE |
| F42 | 4.0 Shop Catalog | D7 featured_products | `{shop_id, product_id, display_order, is_active}` | INSERT / SELECT / DELETE / UPDATE (toggle, reorder) |
| F43 | 4.0 Shop Catalog | D14 mechanic_availability | `{mechanic_id, day_of_week, start_time, end_time, is_available}` | INSERT / SELECT / UPDATE / DELETE |
| F44 | 5.0 AI Chat | D5 parts | `{name, category, unit_price, quantity_in_stock}` | SELECT (build shop context) |
| F45 | 5.0 AI Chat | D6 products | `{name, description, unit_price, category}` | SELECT (build shop context) |
| F46 | 5.0 AI Chat | D1 users | `{id, name, phone, role}` | SELECT mechanics (customer chat) + all users (admin chat) |
| F47 | 5.0 AI Chat | D14 mechanic_availability | `{mechanic_id, day_of_week, start_time, end_time}` | SELECT (availability context) |
| F48 | 5.0 AI Chat | D3 vehicles | `{id, make, model, year}` | SELECT (customer context) |
| F49 | 5.0 AI Chat | D8 appointments | `{service_type, status, scheduled_date}` | SELECT (customer context, limit 5) |
| F50 | 5.0 AI Chat | D9 job_orders | `{id, status, total_cost}` | SELECT (admin context) |
| F51 | 5.0 AI Chat | D12 part_sales | `{part_id, quantity_sold, sale_price}` | SELECT (admin context) |
| F52 | 5.0 AI Chat | D13 reservations | `{id, part_id, status}` | SELECT (admin context) |
| F53 | 6.0 Notifications | D16 customer_notification_settings | `{email_notifications_enabled}` | SELECT (opt-out check) |
| F54 | 6.0 Notifications | D15 notifications | `{recipient_id, appointment_id, type, subject, message, status, sent_at}` | INSERT (audit log) |
| F55 | 7.0 Analytics | D1 users | `{id, email, name, role, shop_id}` | SELECT (user count/roles) |
| F56 | 7.0 Analytics | D2 shops | `{id, name, city, is_active}` | SELECT (shop metrics) |
| F57 | 7.0 Analytics | D8 appointments | `{id, status, total_amount, created_at}` | SELECT (counts, revenue) |
| F58 | 7.0 Analytics | D5 parts | `{id, quantity_in_stock}` | SELECT (inventory metrics) |
| F59 | 7.0 Analytics | D9 job_orders | `{id, status, total_cost}` | SELECT (work order metrics) |
| F60 | 7.0 Analytics | D12 part_sales | `{id, quantity_sold, sale_price, created_at}` | SELECT (POS revenue) |

### 4C. Process -> Process flows

| # | Source | Destination | Data Moved | Trigger |
|---|--------|------------|------------|---------|
| F61 | 2.0 Appointment Mgmt | 3.0 Inventory | `{part_id, quantity}` (stock deduction request) | Appointment marked completed |
| F62 | 2.0 Appointment Mgmt | 6.0 Notifications | `{appointmentId, customerName, customerEmail, vehicleMake, vehicleModel, vehicleYear, serviceType, scheduledDate, partsUsed[], totalAmount, completionNotes}` | Appointment marked completed |
| F63 | 1.0 User Mgmt | 6.0 Notifications | `{user_id, email_enabled: true}` (default preference) | New user signup |
| F64 | 5.0 AI Chat (customer) | 2.0 Appointment Mgmt | `{customer_id, shop_id, mechanic_id, service_type, description, scheduled_date, scheduled_time, notes, parts[], estimated_price}` (tool call from chatbot) | Chatbot books appointment via user request |
| F65 | 5.0 AI Chat (admin) | 7.0 Analytics | aggregate query results (admin chatbot computes metrics and streams back) | Admin asks analytics question |
| F66 | 5.0 AI Chat | E6 Groq API | `{model, messages: [{role, content}], max_tokens, temperature}` | User sends chat message |

---

## 5. SELF-CHECK

- [x] Every process cited traces to real code (file path + line numbers in sections above)
- [x] Every data store maps to an actual table in the schema (MOTOLINK_ERD_SCHEMA.sql)
- [x] Every data flow identifies source, destination, and the actual data that moves
- [x] No processes invented — only the 7 functional groupings the code actually implements
- [x] 66 data flows documented across all entity<->process, process<->store, and process<->process connections
