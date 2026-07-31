-- ============================================================================
-- MOTOLINK NEW ARCHITECTURE — COMPLETE DATABASE SCHEMA
-- Built from actual frontend code analysis (17 tables)
-- Run this entire script in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- PHASE 1: CORE TABLES
-- ============================================================================

-- 1. USERS (auth profiles for all roles)
CREATE TABLE IF NOT EXISTS public.users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'owner', 'mechanic', 'admin')),
  phone       TEXT,
  address     TEXT,
  shop_id     UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_shop_id ON public.users(shop_id);

-- 2. SHOPS (multi-tenant marketplace discovery)
CREATE TABLE IF NOT EXISTS public.shops (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  logo_url        TEXT,
  description     TEXT NOT NULL DEFAULT '',
  address         TEXT NOT NULL,
  city            TEXT NOT NULL,
  latitude        DOUBLE PRECISION CHECK (latitude BETWEEN -90 AND 90),
  longitude       DOUBLE PRECISION CHECK (longitude BETWEEN -180 AND 180),
  phone           TEXT,
  email           TEXT,
  specialties     TEXT[] NOT NULL DEFAULT '{}',
  operating_hours TEXT NOT NULL DEFAULT 'Hours unavailable',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shops_owner_id ON public.shops(owner_id);
CREATE INDEX IF NOT EXISTS idx_shops_active_city ON public.shops(is_active, city);
CREATE INDEX IF NOT EXISTS idx_shops_slug ON public.shops(slug);

-- Now that both users and shops exist, link users.shop_id → shops.id
ALTER TABLE public.users
  ADD CONSTRAINT fk_users_shop
  FOREIGN KEY (shop_id) REFERENCES public.shops(id)
  ON DELETE SET NULL;

-- 3. CUSTOMERS (extended profile for role='customer' users)
CREATE TABLE IF NOT EXISTS public.customers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  phone       TEXT,
  address     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_user_id ON public.customers(user_id);

-- 4. VEHICLES (customer's motorcycles/cars)
CREATE TABLE IF NOT EXISTS public.vehicles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  make            TEXT NOT NULL,
  model           TEXT NOT NULL,
  year            INTEGER,
  engine_number   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_customer_id ON public.vehicles(customer_id);

-- ============================================================================
-- PHASE 2: SERVICES & INVENTORY
-- ============================================================================

-- 5. SERVICES_PRICING (service menu offered by the shop)
CREATE TABLE IF NOT EXISTS public.services_pricing (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label       TEXT NOT NULL,
  description TEXT,
  icon        TEXT,
  price       NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  shop_id     UUID REFERENCES public.shops(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_services_pricing_shop ON public.services_pricing(shop_id);

-- 6. PARTS (inventory per shop)
CREATE TABLE IF NOT EXISTS public.parts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_parts_shop_id ON public.parts(shop_id);
CREATE INDEX IF NOT EXISTS idx_parts_category ON public.parts(category);

-- 7. PRODUCTS (shop products for sale)
CREATE TABLE IF NOT EXISTS public.products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  unit_price  NUMERIC(10,2) NOT NULL DEFAULT 0,
  category    TEXT,
  image_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_shop_id ON public.products(shop_id);

-- 8. FEATURED_PRODUCTS (promoted product carousel)
CREATE TABLE IF NOT EXISTS public.featured_products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  display_order   INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_featured_products_shop ON public.featured_products(shop_id, is_active);

-- ============================================================================
-- PHASE 3: APPOINTMENTS & JOB ORDERS
-- ============================================================================

-- 9. APPOINTMENTS (bookings/scheduling)
CREATE TABLE IF NOT EXISTS public.appointments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  shop_id           UUID REFERENCES public.shops(id) ON DELETE SET NULL,
  mechanic_id       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  vehicle_id        UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  service_type      TEXT NOT NULL,
  description       TEXT,
  scheduled_date    DATE NOT NULL,
  scheduled_time    TIME,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                      'pending', 'confirmed', 'in_progress', 'completed', 'cancelled'
                    )),
  notes             TEXT,
  estimated_price   NUMERIC(10,2),
  total_amount      NUMERIC(10,2),
  parts             JSONB DEFAULT '[]',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointments_customer ON public.appointments(customer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_mechanic ON public.appointments(mechanic_id);
CREATE INDEX IF NOT EXISTS idx_appointments_shop_date ON public.appointments(shop_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON public.appointments(scheduled_date);

-- 10. JOB_ORDERS (mechanic work orders)
CREATE TABLE IF NOT EXISTS public.job_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  appointment_id  UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  customer_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mechanic_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                    'pending', 'in_progress', 'completed', 'billed', 'cancelled'
                  )),
  labor_hours     NUMERIC(5,2),
  labor_rate      NUMERIC(10,2),
  parts_used      JSONB DEFAULT '[]',
  notes           TEXT,
  total_cost      NUMERIC(10,2) DEFAULT 0,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_orders_shop ON public.job_orders(shop_id);
CREATE INDEX IF NOT EXISTS idx_job_orders_customer ON public.job_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_job_orders_mechanic ON public.job_orders(mechanic_id);
CREATE INDEX IF NOT EXISTS idx_job_orders_appointment ON public.job_orders(appointment_id);

-- 11. JOB_ORDER_ITEMS (line items in a job order)
CREATE TABLE IF NOT EXISTS public.job_order_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_order_id    UUID NOT NULL REFERENCES public.job_orders(id) ON DELETE CASCADE,
  part_id         UUID REFERENCES public.parts(id) ON DELETE SET NULL,
  quantity        INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_order_items_order ON public.job_order_items(job_order_id);

-- ============================================================================
-- PHASE 4: SALES & BILLING
-- ============================================================================

-- 12. INVOICES
CREATE TABLE IF NOT EXISTS public.invoices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_order_id      UUID REFERENCES public.job_orders(id) ON DELETE SET NULL,
  customer_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  total_amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_status    TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN (
                      'unpaid', 'paid', 'overdue', 'cancelled'
                    )),
  payment_method    TEXT,
  paid_date         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_customer ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_job_order ON public.invoices(job_order_id);

-- 13. PART_SALES (individual part sale transactions)
CREATE TABLE IF NOT EXISTS public.part_sales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id         UUID NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,
  shop_id         UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  quantity_sold   INTEGER NOT NULL DEFAULT 1,
  unit_price      NUMERIC(10,2) NOT NULL DEFAULT 0,
  sale_price      NUMERIC(10,2) NOT NULL DEFAULT 0,
  sold_by         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_part_sales_part ON public.part_sales(part_id);
CREATE INDEX IF NOT EXISTS idx_part_sales_shop_date ON public.part_sales(shop_id, created_at);

-- 14. RESERVATIONS (walk-in / hold orders)
CREATE TABLE IF NOT EXISTS public.reservations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  part_id         UUID NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,
  shop_id         UUID REFERENCES public.shops(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                    'pending', 'confirmed', 'fulfilled', 'cancelled'
                  )),
  quantity        INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reservations_customer ON public.reservations(customer_id);
CREATE INDEX IF NOT EXISTS idx_reservations_part ON public.reservations(part_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON public.reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_shop ON public.reservations(shop_id);

-- ============================================================================
-- PHASE 5: MECHANIC AVAILABILITY
-- ============================================================================

-- 15. MECHANIC_AVAILABILITY (weekly schedule per mechanic)
CREATE TABLE IF NOT EXISTS public.mechanic_availability (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mechanic_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  day_of_week     INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  is_available    BOOLEAN NOT NULL DEFAULT true,
  shop_id         UUID REFERENCES public.shops(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mechanic_avail_user ON public.mechanic_availability(mechanic_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mechanic_avail_unique ON public.mechanic_availability(mechanic_id, day_of_week, start_time);
CREATE INDEX IF NOT EXISTS idx_mechanic_avail_shop ON public.mechanic_availability(shop_id);

-- ============================================================================
-- PHASE 6: NOTIFICATIONS
-- ============================================================================

-- 16. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  appointment_id  UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  type            TEXT NOT NULL,
  subject         TEXT,
  message         TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_id);

-- 17. CUSTOMER_NOTIFICATION_SETTINGS
CREATE TABLE IF NOT EXISTS public.customer_notification_settings (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  email_notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_settings_user ON public.customer_notification_settings(user_id);

-- ============================================================================
-- PHASE 7: ROW-LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.featured_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mechanic_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_notification_settings ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PHASE 8: RLS POLICIES
-- ============================================================================

-- USERS
CREATE POLICY "Users can view own profile"
  ON public.users FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.users FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Shop owners can view shop members"
  ON public.users FOR SELECT USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
  );

-- ADMIN RLS: Helper function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ADMIN: Can view all users
CREATE POLICY "Admin can view all users"
  ON public.users FOR SELECT USING (public.is_admin());

-- SHOPS (public read for active, owner full access)
CREATE POLICY "Anyone can browse active shops"
  ON public.shops FOR SELECT USING (is_active = true);

CREATE POLICY "Shop owners can manage own shop"
  ON public.shops FOR ALL USING (owner_id = auth.uid());

CREATE POLICY "Admin can view all shops"
  ON public.shops FOR SELECT USING (public.is_admin());

-- CUSTOMERS
CREATE POLICY "Users can view own customer profile"
  ON public.customers FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own customer profile"
  ON public.customers FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own customer profile"
  ON public.customers FOR UPDATE USING (auth.uid() = user_id);

-- VEHICLES
CREATE POLICY "Users can view own vehicles"
  ON public.vehicles FOR SELECT USING (auth.uid() = customer_id);

CREATE POLICY "Users can manage own vehicles"
  ON public.vehicles FOR ALL USING (auth.uid() = customer_id);

-- SERVICES PRICING (public read + owner manages own shop's rows)
CREATE POLICY "Anyone can view active services"
  ON public.services_pricing FOR SELECT USING (is_active = true);

CREATE POLICY "Shop owners can manage own services"
  ON public.services_pricing FOR ALL USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
  )
  WITH CHECK (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
  );

-- PARTS
CREATE POLICY "Anyone can browse parts"
  ON public.parts FOR SELECT USING (true);

CREATE POLICY "Shop owners can manage own parts"
  ON public.parts FOR ALL USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
  );

CREATE POLICY "Admin can view all parts"
  ON public.parts FOR SELECT USING (public.is_admin());

-- PRODUCTS
CREATE POLICY "Anyone can browse products"
  ON public.products FOR SELECT USING (true);

CREATE POLICY "Shop owners can manage own products"
  ON public.products FOR ALL USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
  );

CREATE POLICY "Admin can view all products"
  ON public.products FOR SELECT USING (public.is_admin());

-- FEATURED PRODUCTS
CREATE POLICY "Anyone can view active featured products"
  ON public.featured_products FOR SELECT USING (is_active = true);

CREATE POLICY "Shop owners can manage own featured products"
  ON public.featured_products FOR ALL USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
  );

-- APPOINTMENTS
CREATE POLICY "Customers can view own appointments"
  ON public.appointments FOR SELECT USING (auth.uid() = customer_id);

CREATE POLICY "Customers can create own appointments"
  ON public.appointments FOR INSERT WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Customers can cancel own pending appointments"
  ON public.appointments FOR UPDATE
  USING (auth.uid() = customer_id AND status = 'pending')
  WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Mechanics can view assigned appointments"
  ON public.appointments FOR SELECT USING (auth.uid() = mechanic_id);

CREATE POLICY "Mechanics can update assigned appointments"
  ON public.appointments FOR UPDATE USING (auth.uid() = mechanic_id);

CREATE POLICY "Shop owners can manage shop appointments"
  ON public.appointments FOR ALL USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
  );

CREATE POLICY "Admin can view all appointments"
  ON public.appointments FOR SELECT USING (public.is_admin());

-- JOB ORDERS
CREATE POLICY "Shop members can view job orders"
  ON public.job_orders FOR SELECT USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    OR mechanic_id = auth.uid()
    OR customer_id = auth.uid()
  );

CREATE POLICY "Shop owners can manage job orders"
  ON public.job_orders FOR ALL USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
  );

-- JOB ORDER ITEMS
CREATE POLICY "Shop members can view job order items"
  ON public.job_order_items FOR SELECT USING (
    job_order_id IN (
      SELECT id FROM public.job_orders WHERE
        shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
        OR mechanic_id = auth.uid()
        OR customer_id = auth.uid()
    )
  );

CREATE POLICY "Shop owners can manage job order items"
  ON public.job_order_items FOR ALL USING (
    job_order_id IN (
      SELECT id FROM public.job_orders WHERE
        shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    )
  );

-- INVOICES
CREATE POLICY "Customers can view own invoices"
  ON public.invoices FOR SELECT USING (auth.uid() = customer_id);

CREATE POLICY "Shop owners can manage invoices"
  ON public.invoices FOR ALL USING (
    job_order_id IN (
      SELECT id FROM public.job_orders WHERE
        shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    )
  );

-- PART SALES
CREATE POLICY "Shop owners can view own part sales"
  ON public.part_sales FOR SELECT USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
  );

CREATE POLICY "Shop owners can manage own part sales"
  ON public.part_sales FOR ALL USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
  );

-- RESERVATIONS
CREATE POLICY "Customers can view own reservations"
  ON public.reservations FOR SELECT USING (auth.uid() = customer_id);

CREATE POLICY "Customers can create own reservations"
  ON public.reservations FOR INSERT WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Shop owners can view own reservations"
  ON public.reservations FOR SELECT USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
  );

CREATE POLICY "Shop owners can update own reservations"
  ON public.reservations FOR UPDATE USING (
    shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
  );

-- MECHANIC AVAILABILITY
CREATE POLICY "Anyone can view mechanic availability"
  ON public.mechanic_availability FOR SELECT USING (true);

CREATE POLICY "Mechanics can manage own availability"
  ON public.mechanic_availability FOR ALL USING (auth.uid() = mechanic_id);

CREATE POLICY "Shop owners can manage mechanic availability"
  ON public.mechanic_availability FOR ALL USING (
    mechanic_id IN (
      SELECT id FROM public.users WHERE
        role = 'mechanic'
        AND shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    )
  );

-- NOTIFICATIONS
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT USING (auth.uid() = recipient_id);

CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT WITH CHECK (true);

-- CUSTOMER NOTIFICATION SETTINGS
CREATE POLICY "Users can view own notification settings"
  ON public.customer_notification_settings FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own notification settings"
  ON public.customer_notification_settings FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notification settings"
  ON public.customer_notification_settings FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================================
-- PHASE 9: TRIGGER — auto-set updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.shops
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.parts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.featured_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.job_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.customer_notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- PHASE 10: SEED DATA (optional defaults)
-- ============================================================================

-- Default services pricing
INSERT INTO public.services_pricing (label, description, icon, price, is_active) VALUES
  ('Oil Change', 'Full synthetic oil change with filter', 'wrench', 850, true),
  ('Tire Repair', 'Puncture patch or tube replacement', 'circle', 350, true),
  ('Brake Service', 'Brake pad replacement and adjustment', 'shield', 1200, true),
  ('Engine Tune-up', 'Spark plug, air filter, carb cleaning', 'settings', 1500, true),
  ('General Checkup', 'Full vehicle inspection and diagnostics', 'search', 500, true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- VERIFY
-- ============================================================================

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
