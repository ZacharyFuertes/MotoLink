---
title: MotoLink Logic and Algorithm
tags:
  - motolink
  - logic
  - algorithm
  - auth
  - inventory
  - appointments
date: 2026-08-01
---

# MotoLink Logic and Algorithm

> [!abstract] Purpose
> This note captures the core decision logic, business rules, and algorithmic patterns used by MotoLink during authentication, shop discovery, appointment handling, inventory monitoring, and job-order processing.

---

## 1. Core Logic Model

MotoLink operates as a multi-tenant service platform where every major workflow is anchored on these business rules:

1. Every user belongs to exactly one role:
   - `customer`
   - `mechanic`
   - `owner`
   - `admin`

2. Data access is scoped to the relevant `shop_id`.
   - Customers only see their own records.
   - Mechanics and owners see records tied to their assigned shop.
   - Admins can manage the global platform view.

3. Every transactional workflow is enforced first at the UI layer and second at the database layer through Supabase RLS.

---

## 2. Authentication and Role Resolution Logic

### Authentication Flow

```text
Start
  ↓
User submits email + password
  ↓
Supabase Auth validates credentials
  ↓
AuthContext receives session
  ↓
Fetch profile from users table using auth user UUID
  ↓
Role is resolved from users.role
  ↓
Navigate to role-specific portal
```

### Role Rules

- `customer` → customer portal experience
- `mechanic` → workshop operations and assigned jobs
- `owner` → shop-level management and inventory control
- `admin` → platform dashboard, global oversight

### Access Rule Algorithm

```text
if role == 'customer':
  allow view own appointments, own vehicles, own service history
else if role == 'mechanic':
  allow manage assigned appointments and job orders
else if role == 'owner':
  allow manage shop, inventory, staff, bookings
else if role == 'admin':
  allow platform-wide analytics and user control
```

---

## 3. Shop Discovery Algorithm

The shop discovery experience uses browser geolocation and a distance-sorting algorithm.

### Distance Calculation

MotoLink applies the Haversine formula to compute the distance between the user location and each shop location.

```text
distanceKm = earthRadiusKm * 2 * atan2(
  sqrt(sin²(Δlat/2) + cos(lat1) * cos(lat2) * sin²(Δlon/2)),
  sqrt(1 - haversine)
)
```

### Sorting Strategy

```text
1. Read available shops from Supabase
2. Measure distance from current user coordinates
3. Attach distanceKm to each shop
4. Sort ascending by distance
5. Filter by specialty, city, or availability flags if requested
6. Render shops nearest-first
```

This produces a local discovery sequence such as:

- nearest shop first
- specialty match second
- availability filter third
- city search last

---

## 4. Appointment Booking Logic

### Booking Rule Set

1. A customer selects a vehicle, service type, date, time, and shop.
2. The system validates that the selected shop exists and is active.
3. The appointment is inserted into the `appointments` table.
4. A matching `job_order` record is created when the appointment becomes actionable.
5. The status moves through lifecycle states:
   - `pending`
   - `confirmed`
   - `in_progress`
   - `completed`
   - `cancelled`

### Business Logic

```text
customer creates appointment
  ↓
store customer_id, vehicle_id, shop_id, mechanic_id(optional)
  ↓
set status = 'pending'
  ↓
if shop accepts and confirms:
    status = 'confirmed'
  ↓
if technician starts work:
    status = 'in_progress'
  ↓
if service is completed:
    status = 'completed'
```

---

## 5. Inventory and Low-Stock Algorithm

### Inventory Rule

Every part item is linked to a `shop_id` and tracked by stock quantity.

```text
if quantity_in_stock <= reorder_level:
    mark as low stock
    show alert in dashboard / low-stock page
```

### Alert Logic

- `quantity_in_stock` is read from the `parts` table.
- `reorder_level` acts as the threshold boundary.
- Shop owners and admins receive visibility into urgent stock levels.

### Low-Stock Priority

```text
sort parts by:
  1. quantity_in_stock ascending
  2. reorder_level descending
  3. category priority if needed
```

This makes restocking decisions readable and actionable.

---

## 6. Job Order and Labor Tracking Logic

When an appointment enters service, MotoLink creates or resolves a job order as the operational work record.

### Workflow

```text
appointment exists
  ↓
ensure job order for appointment
  ↓
mechanic logs labor hours and labor rate
  ↓
mechanic records parts used
  ↓
job order total_cost = labor + parts_used value
  ↓
status is updated to billed / completed as appropriate
```

### Cost Algorithm

```text
total_cost = labor_hours * labor_rate + sum(part_quantity * unit_price)
```

This enables the invoice and billing view that follows the completed service cycle.

---

## 7. Notification and Service Completion Logic

MotoLink sends notification messages after service-related events, especially when the service is completed.

### Notification Trigger

```text
if appointment status changes to 'completed':
    retrieve customer contact data
    compile service summary
    send transactional email / notification
```

### Notification Rule Set

- customer notifications should be scoped to the relevant customer record
- opt-out preference is respected
- delivery is handled through the notification service layer

---

## 8. Security and Tenancy Logic

The platform follows tenancy principles that mirror the real database design:

```text
user session is created
  ↓
role is resolved from profile
  ↓
shop_id is attached to user profile when applicable
  ↓
all queries are filtered to shop_id scope
  ↓
RLS blocks cross-shop access
```

### Result

This gives MotoLink a strict owner/operator isolation pattern while still allowing admin-level oversight.

---

## 9. Summary Algorithm

MotoLink can be described by the following high-level logic:

```text
Authenticate user
  ↓
Resolve role and shop scope
  ↓
Serve role-specific portal and permitted actions
  ↓
Process appointments, inventory, and job orders
  ↓
Emit notifications and analytics
  ↓
Protect all data through tenant-aware RLS
```

---

## 10. Related Notes
- [[MotoLink Architecture]]
- [[MotoLink System Flow]]
