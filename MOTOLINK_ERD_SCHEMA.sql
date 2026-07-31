-- ============================================================================
-- MOTOLINK — ERD-Ready Database Schema
-- Generated from live Supabase database + frontend usage analysis
-- Stripped of RLS policies, triggers, and functions — clean for ERD tools
-- ============================================================================

-- ============================================================================
-- 1. USERS (all roles: customer, owner, mechanic, admin)
-- ============================================================================
CREATE TABLE users (
  id          UUID PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'owner', 'mechanic', 'admin')),
  phone       TEXT,
  address     TEXT,
  shop_id     UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. SHOPS (multi-tenant marketplace)
-- ============================================================================
CREATE TABLE shops (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  logo_url        TEXT,
  description     TEXT NOT NULL DEFAULT '',
  address         TEXT NOT NULL,
  city            TEXT NOT NULL,
  latitude        DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude       DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  phone           TEXT,
  email           TEXT,
  specialties     TEXT[] NOT NULL DEFAULT '{}',
  operating_hours TEXT NOT NULL DEFAULT 'Hours unavailable',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add shop_id FK after both tables exist
ALTER TABLE users
  ADD CONSTRAINT fk_users_shop
  FOREIGN KEY (shop_id) REFERENCES shops(id)
  ON DELETE SET NULL;

-- ============================================================================
-- 3. VEHICLES (customer motorcycles/cars)
-- ============================================================================
CREATE TABLE vehicles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  make            TEXT NOT NULL,
  model           TEXT NOT NULL,
  year            INTEGER,
  engine_number   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 4. SERVICES_PRICING (service menu offered by shops)
-- ============================================================================
CREATE TABLE services_pricing (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label       TEXT NOT NULL,
  description TEXT,
  icon        TEXT,
  price       NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  shop_id     UUID REFERENCES shops(id) ON DELETE CASCADE
);

-- ============================================================================
-- 5. PARTS (inventory per shop)
-- ============================================================================
CREATE TABLE parts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  sku                 TEXT,
  category            TEXT,
  description         TEXT,
  quantity_in_stock   INTEGER NOT NULL DEFAULT 0,
  reorder_level       INTEGER NOT NULL DEFAULT 5,
  unit_price          NUMERIC(10,2) NOT NULL DEFAULT 0,
  image_url           TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 6. PRODUCTS (shop products for sale)
-- ============================================================================
CREATE TABLE products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  unit_price  NUMERIC(10,2) NOT NULL DEFAULT 0,
  category    TEXT,
  image_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 7. FEATURED_PRODUCTS (promoted products)
-- ============================================================================
CREATE TABLE featured_products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  display_order   INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 8. APPOINTMENTS (bookings/scheduling)
-- ============================================================================
CREATE TABLE appointments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_id           UUID REFERENCES shops(id) ON DELETE SET NULL,
  mechanic_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  vehicle_id        UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  service_type      TEXT NOT NULL,
  description       TEXT,
  scheduled_date    DATE NOT NULL,
  scheduled_time    TIME,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  notes             TEXT,
  estimated_price   NUMERIC(10,2),
  total_amount      NUMERIC(10,2),
  parts             JSONB DEFAULT '[]',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 9. JOB_ORDERS (mechanic work orders)
-- ============================================================================
CREATE TABLE job_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  appointment_id  UUID REFERENCES appointments(id) ON DELETE SET NULL,
  customer_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mechanic_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'billed', 'cancelled')),
  labor_hours     NUMERIC(5,2),
  labor_rate      NUMERIC(10,2),
  parts_used      JSONB DEFAULT '[]',
  notes           TEXT,
  total_cost      NUMERIC(10,2) DEFAULT 0,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 10. JOB_ORDER_ITEMS (line items in a job order)
-- ============================================================================
CREATE TABLE job_order_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_order_id    UUID NOT NULL REFERENCES job_orders(id) ON DELETE CASCADE,
  part_id         UUID REFERENCES parts(id) ON DELETE SET NULL,
  quantity        INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 11. INVOICES
-- ============================================================================
CREATE TABLE invoices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_order_id      UUID REFERENCES job_orders(id) ON DELETE SET NULL,
  customer_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total_amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_status    TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'overdue', 'cancelled')),
  payment_method    TEXT,
  paid_date         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 12. PART_SALES (individual part sale transactions)
-- ============================================================================
CREATE TABLE part_sales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id         UUID NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  shop_id         UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  quantity_sold   INTEGER NOT NULL DEFAULT 1,
  unit_price      NUMERIC(10,2) NOT NULL DEFAULT 0,
  sale_price      NUMERIC(10,2) NOT NULL DEFAULT 0,
  sold_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 13. RESERVATIONS (walk-in / hold orders)
-- ============================================================================
CREATE TABLE reservations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  part_id         UUID NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'fulfilled', 'cancelled')),
  quantity        INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 14. MECHANIC_AVAILABILITY (weekly schedule per mechanic)
-- ============================================================================
CREATE TABLE mechanic_availability (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mechanic_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week     INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  is_available    BOOLEAN NOT NULL DEFAULT true,
  shop_id         UUID REFERENCES shops(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 15. NOTIFICATIONS
-- ============================================================================
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  appointment_id  UUID REFERENCES appointments(id) ON DELETE SET NULL,
  type            TEXT NOT NULL,
  subject         TEXT,
  message         TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 16. CUSTOMER_NOTIFICATION_SETTINGS
-- ============================================================================
CREATE TABLE customer_notification_settings (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  email_notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_shop_id ON users(shop_id);

-- Shops
CREATE INDEX idx_shops_owner_id ON shops(owner_id);
CREATE INDEX idx_shops_slug ON shops(slug);
CREATE INDEX idx_shops_active_city ON shops(is_active, city);

-- Vehicles
CREATE INDEX idx_vehicles_customer_id ON vehicles(customer_id);

-- Services Pricing
CREATE INDEX idx_services_pricing_shop ON services_pricing(shop_id);

-- Parts
CREATE INDEX idx_parts_shop_id ON parts(shop_id);
CREATE INDEX idx_parts_category ON parts(category);

-- Products
CREATE INDEX idx_products_shop_id ON products(shop_id);

-- Featured Products
CREATE INDEX idx_featured_products_shop ON featured_products(shop_id, is_active);

-- Appointments
CREATE INDEX idx_appointments_customer ON appointments(customer_id);
CREATE INDEX idx_appointments_mechanic ON appointments(mechanic_id);
CREATE INDEX idx_appointments_shop_date ON appointments(shop_id, scheduled_date);
CREATE INDEX idx_appointments_status ON appointments(status);

-- Job Orders
CREATE INDEX idx_job_orders_shop ON job_orders(shop_id);
CREATE INDEX idx_job_orders_customer ON job_orders(customer_id);
CREATE INDEX idx_job_orders_mechanic ON job_orders(mechanic_id);
CREATE INDEX idx_job_orders_appointment ON job_orders(appointment_id);

-- Job Order Items
CREATE INDEX idx_job_order_items_order ON job_order_items(job_order_id);

-- Invoices
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_job_order ON invoices(job_order_id);

-- Part Sales
CREATE INDEX idx_part_sales_part ON part_sales(part_id);
CREATE INDEX idx_part_sales_shop_date ON part_sales(shop_id, created_at);

-- Reservations
CREATE INDEX idx_reservations_customer ON reservations(customer_id);
CREATE INDEX idx_reservations_part ON reservations(part_id);
CREATE INDEX idx_reservations_status ON reservations(status);

-- Mechanic Availability
CREATE INDEX idx_mechanic_avail_user ON mechanic_availability(mechanic_id);
CREATE UNIQUE INDEX idx_mechanic_avail_unique ON mechanic_availability(mechanic_id, day_of_week, start_time);
CREATE INDEX idx_mechanic_avail_shop ON mechanic_availability(shop_id);

-- Notifications
CREATE INDEX idx_notifications_recipient ON notifications(recipient_id);

-- Customer Notification Settings
CREATE INDEX idx_notif_settings_user ON customer_notification_settings(user_id);
