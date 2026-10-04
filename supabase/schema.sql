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
  description     TEXT DEFAULT '',
  address         TEXT NOT NULL,
  city            TEXT NOT NULL,
  latitude        DOUBLE PRECISION CHECK (latitude BETWEEN -90 AND 90),
  longitude       DOUBLE PRECISION CHECK (longitude BETWEEN -180 AND 180),
  phone           TEXT,
  email           TEXT,
  operating_hours TEXT NOT NULL DEFAULT 'Hours unavailable',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_open         BOOLEAN NOT NULL DEFAULT true,
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
  -- NULL for a walk-in customer who has no MotoLink account yet. Linkable later
  -- via claim_walk_in_appointment(booking_id).
  customer_id       UUID REFERENCES public.users(id) ON DELETE CASCADE,
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
  -- Walk-in identity, set only while customer_id IS NULL.
  walk_in_name      TEXT,
  walk_in_phone     TEXT,
  notes             TEXT,
  estimated_price   NUMERIC(10,2),
  total_amount      NUMERIC(10,2),
  parts             JSONB DEFAULT '[]',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Human-readable receipt reference (MTL-YYYYMMDD-XXXXXX), generated
  -- server-side by the trigger below.
  booking_id        VARCHAR(40) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_appointments_customer ON public.appointments(customer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_mechanic ON public.appointments(mechanic_id);
CREATE INDEX IF NOT EXISTS idx_appointments_shop_date ON public.appointments(shop_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON public.appointments(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_appointments_walk_in_phone ON public.appointments(walk_in_phone);
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_booking_id ON public.appointments(booking_id);

-- 10. JOB_ORDERS (mechanic work orders)
CREATE TABLE IF NOT EXISTS public.job_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  appointment_id  UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  -- NULL when the source appointment was a walk-in.
  customer_id     UUID REFERENCES public.users(id) ON DELETE CASCADE,
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
  -- NULL when the source job order came from a walk-in appointment.
  customer_id       UUID REFERENCES public.users(id) ON DELETE CASCADE,
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
  read            BOOLEAN NOT NULL DEFAULT false,
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

-- Customers/marketplace: anyone can view mechanics of active shops
-- (ShopDetailPage fetches users WHERE role='mechanic' AND shop_id=<shop>).
CREATE POLICY "Anyone can view shop mechanics"
  ON public.users FOR SELECT USING (
    role = 'mechanic'
    AND shop_id IN (SELECT id FROM public.shops WHERE is_active = true)
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

-- Admin can update any shop (approve / deactivate / edit)
CREATE POLICY "Admin can update all shops"
  ON public.shops FOR UPDATE USING (public.is_admin());

-- Admin can delete any shop (cascades to dependent rows; users.shop_id is SET NULL)
CREATE POLICY "Admin can delete all shops"
  ON public.shops FOR DELETE USING (public.is_admin());

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

CREATE POLICY "Recipients can mark own notifications read"
  ON public.notifications FOR UPDATE USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

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

-- Trigger: notify shop owner when a customer books an appointment
CREATE OR REPLACE FUNCTION public.notify_shop_owner_on_appointment()
RETURNS TRIGGER AS $$
DECLARE
  v_owner_id   UUID;
  v_customer   TEXT;
BEGIN
  SELECT owner_id INTO v_owner_id
  FROM public.shops WHERE id = NEW.shop_id;

  IF v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.customer_id IS NULL THEN
    -- Walk-in: there is no users row to look up, so use the recorded name.
    -- (Without this the SELECT below matches zero rows and the notification
    -- message starts with a blank " booked ...".)
    v_customer := COALESCE(NULLIF(NEW.walk_in_name, ''), 'A walk-in customer');
  ELSE
    SELECT COALESCE(u.name, 'A customer') INTO v_customer
    FROM public.users u WHERE u.id = NEW.customer_id;
  END IF;

  INSERT INTO public.notifications (
    recipient_id, appointment_id, type, subject, message, status
  ) VALUES (
    v_owner_id,
    NEW.id,
    'appointment',
    'New appointment booked',
    v_customer || ' booked ' || COALESCE(NEW.service_type, 'a service') ||
    ' for ' || NEW.scheduled_date::text || '.',
    'pending'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER notify_shop_owner_on_appointment
  AFTER INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.notify_shop_owner_on_appointment();

-- ============================================================================
-- PHASE 10: SIGNUP HELPERS (owner registration + auto profile creation)
-- ============================================================================

-- Auto-create public.users profile the moment an auth.users row is inserted.
-- Eliminates the client-side auth-listener race that could leave a new owner
-- stuck at role 'customer' (the profile always exists before client code runs).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1), 'User'),
    'customer'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Atomic shop-owner registration: owner profile + shop + shop_id link in ONE
-- transaction (SECURITY DEFINER). No partial state, no FK race, no demotion.
CREATE OR REPLACE FUNCTION public.register_shop_owner(
  p_user_id      uuid,
  p_email        text,
  p_name         text,
  p_shop_name    text,
  p_slug         text,
  p_description  text  DEFAULT '',
  p_address      text  DEFAULT '',
  p_city         text  DEFAULT '',
  p_latitude     double precision DEFAULT NULL,
  p_longitude    double precision DEFAULT NULL,
  p_phone        text  DEFAULT NULL,
  p_is_active    boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shop_id uuid;
BEGIN
  -- Only the authenticated user may register for their own account
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  -- 1) Upsert the owner profile (handle_new_user may have created it as customer)
  INSERT INTO public.users (id, email, name, role, phone)
  VALUES (p_user_id, p_email, p_name, 'owner', p_phone)
  ON CONFLICT (id) DO UPDATE
    SET email   = EXCLUDED.email,
        name    = EXCLUDED.name,
        role    = 'owner',
        phone   = EXCLUDED.phone,
        updated_at = now();

  -- 2) Insert the shop (FK owner_id → users.id now always resolves)
  INSERT INTO public.shops (
    owner_id, name, slug, description, address, city,
    latitude, longitude, phone, email, is_active
  )
  VALUES (
    p_user_id, p_shop_name, p_slug,
    COALESCE(NULLIF(p_description, ''), ''),
    COALESCE(p_address, ''), COALESCE(p_city, ''),
    p_latitude, p_longitude, p_phone, p_email,
    p_is_active
  )
  RETURNING id INTO v_shop_id;

  -- 3) Link the owner to their shop
  UPDATE public.users
  SET shop_id = v_shop_id, updated_at = now()
  WHERE id = p_user_id;

  RETURN v_shop_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_shop_owner TO authenticated;

-- ============================================================================
-- PHASE 10b: WALK-IN APPOINTMENTS
-- A shop owner can book a service for a customer who has no MotoLink account.
-- Such an appointment has customer_id = NULL plus walk_in_name / walk_in_phone.
-- The customer later attaches it to their fresh account by entering the
-- booking reference (booking_id) printed on their receipt.
-- ============================================================================

-- Generate the receipt reference server-side on every insert.
CREATE OR REPLACE FUNCTION public.generate_appointment_booking_id()
RETURNS TRIGGER AS $$
DECLARE
  v_suffix TEXT;
BEGIN
  IF NEW.booking_id IS NOT NULL AND NEW.booking_id <> '' THEN
    RETURN NEW;
  END IF;

  v_suffix := upper(substr(replace(NEW.id::text, '-', ''), 6, 6));
  NEW.booking_id := 'MTL-'
                    || to_char(date_trunc('day', NEW.scheduled_date)::date, 'YYYYMMDD')
                    || '-'
                    || v_suffix;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_appointment_generate_booking_id ON public.appointments;
CREATE TRIGGER trg_appointment_generate_booking_id
  BEFORE INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.generate_appointment_booking_id();

COMMENT ON COLUMN public.appointments.booking_id IS
  'Short human-readable booking reference (MTL-YYYYMMDD-XXXXXX). Server-generated on insert.';
COMMENT ON COLUMN public.appointments.customer_id IS
  'Registered customer. NULL for a walk-in — see walk_in_name / walk_in_phone. Linkable later via claim_walk_in_appointment(booking_id).';
COMMENT ON COLUMN public.job_orders.customer_id IS
  'Registered customer, or NULL when the source appointment is a walk-in.';
COMMENT ON COLUMN public.invoices.customer_id IS
  'Registered customer, or NULL when the source job order came from a walk-in.';
COMMENT ON COLUMN public.appointments.walk_in_name IS
  'Walk-in customer''s name. Set only while customer_id IS NULL.';
COMMENT ON COLUMN public.appointments.walk_in_phone IS
  'Walk-in customer''s phone. Set only while customer_id IS NULL.';

-- Link a walk-in service to the caller's account using its booking reference.
-- This is an RPC rather than a client UPDATE on purpose: a direct .update()
-- would need an RLS policy loose enough for a signed-in user to attach an
-- unlinked appointment to themselves, which would also let one customer
-- hijack another customer's walk-in. Here the reference is validated
-- server-side inside a single transaction instead.
CREATE OR REPLACE FUNCTION public.claim_walk_in_appointment(p_booking_id TEXT)
RETURNS TABLE (
  id            UUID,
  booking_id    TEXT,
  shop_id       UUID,
  service_type  TEXT,
  scheduled_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_apt public.appointments;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to link a booking reference.';
  END IF;

  IF p_booking_id IS NULL OR btrim(p_booking_id) = '' THEN
    RAISE EXCEPTION 'Enter a booking reference.';
  END IF;

  -- Reference lookup is case-insensitive and tolerates surrounding whitespace so
  -- the customer can paste the reference straight off a receipt.
  --
  -- Every column is table-qualified: the RETURNS TABLE output parameters are
  -- named id / booking_id / shop_id / service_type / scheduled_date, so an
  -- unqualified reference would be ambiguous with plpgsql.variable_conflict =
  -- error and the function would fail at runtime.
  SELECT a.* INTO v_apt
  FROM public.appointments a
  WHERE upper(btrim(a.booking_id)) = upper(btrim(p_booking_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No booking found with reference "%". Check the reference and try again.', p_booking_id;
  END IF;

  IF v_apt.customer_id IS NOT NULL THEN
    IF v_apt.customer_id = auth.uid() THEN
      RAISE EXCEPTION 'This booking is already linked to your account.';
    END IF;
    RAISE EXCEPTION 'This booking reference has already been claimed.';
  END IF;

  -- The customer_id IS NULL re-check makes the claim safe against a concurrent
  -- second claim: whichever transaction updates first wins, and the loser
  -- updates zero rows instead of silently stealing the booking.
  -- (updated_at is maintained by the set_updated_at BEFORE UPDATE trigger.)
  UPDATE public.appointments a
  SET customer_id   = auth.uid(),
      walk_in_name  = NULL,
      walk_in_phone = NULL
  WHERE a.id = v_apt.id
    AND a.customer_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This booking reference has already been claimed.';
  END IF;

  RETURN QUERY
  SELECT v_apt.id, v_apt.booking_id, v_apt.shop_id,
         v_apt.service_type, v_apt.scheduled_date;
END;
$$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, which would also expose
-- this to anon. Narrow it to signed-in users only.
REVOKE EXECUTE ON FUNCTION public.claim_walk_in_appointment(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_walk_in_appointment(TEXT) TO authenticated;

COMMENT ON FUNCTION public.claim_walk_in_appointment(TEXT) IS
  'Links an unlinked walk-in appointment to the calling user''s account using its booking reference.';

-- ============================================================================
-- PHASE 11: SEED DATA (optional defaults)
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

-- APPENDED: registered customer search (from migration 20261004_registered_customer_search.sql)

-- ============================================================================
-- MIGRATION: Global registered-customer search for owner bookings
-- Run this in the Supabase SQL Editor (after 20261003_walk_in_appointments.sql).
-- ============================================================================
--
-- Root cause this fixes:
--   WalkInBookingModal's "Registered" mode searched
--     .from("users").select(...).eq("role","customer").eq("shop_id", shopId)
--   so it could only ever list customers already linked to *this* shop. Any
--   customer who signed up to MotoLink but has never booked here has
--   users.shop_id = NULL and was invisible, even though the booking API would
--   have accepted their ID happily.
--
--   The shop_id filter is not the only thing in the way — it is the only thing
--   the *RLS* allows. Policy "Shop owners can view shop members"
--   (supabase/schema.sql) is:
--     USING (shop_id IN (SELECT id FROM shops WHERE owner_id = auth.uid()))
--   so an owner gets zero rows for everyone else. Dropping .eq("shop_id", ...)
--   from the client query would just trade "no customers" for "no customers".
--
-- This migration:
--   A. Adds search_registered_customers() — a SECURITY DEFINER function that
--      searches every role='customer' account on the platform and returns only
--      id / name / phone / email / is_shop_member.
--   B. Adds policy "Shop owners can view customers they serve", so a customer
--      who has an appointment at the owner's shop can be *read back* by the
--      existing `customer:users!customer_id (name, phone)` embeds.
--
-- Why B is needed at all (the bug it prevents):
--   PostgREST applies `users` RLS to embedded resources. After booking for a
--   customer with shop_id = NULL the appointment row is created fine, but the
--   embed comes back null, so AppointmentCalendarPage / Dashboard /
--   AdminAppointmentsPage render the card with a BLANK name and phone even
--   though the booking succeeded. Without B, "Registered" bookings would look
--   like they failed.
--
-- Why A is an RPC and not a looser RLS policy:
--   A SELECT policy on `users` applies to whole rows. Any policy loose enough
--   for an owner to search every customer would also expose every column of
--   every customer row (address included) to any owner, and `select *` would
--   hand all of it over. The RPC keeps the surface to four columns, rejects
--   non-owners, and caps how much one call can return.
-- ============================================================================


-- ── A) Global customer search ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.search_registered_customers(
  p_query TEXT     DEFAULT NULL,
  p_limit INTEGER  DEFAULT 8
)
RETURNS TABLE (
  id             UUID,
  name           TEXT,
  phone          TEXT,
  email          TEXT,
  is_shop_member BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_shop_ids UUID[] := '{}'::UUID[];
  v_q        TEXT;
  v_limit    INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to search customers.';
  END IF;

  -- Owners and admins only. Without this gate any signed-in customer could
  -- enumerate every other customer on the platform through this function,
  -- since SECURITY DEFINER bypasses the `users` SELECT policies.
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_uid AND u.role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Only shop owners can search customer accounts.';
  END IF;

  -- An owner's shops, used only to flag which results already belong to them.
  SELECT COALESCE(array_agg(s.id), '{}'::UUID[])
    INTO v_shop_ids
  FROM public.shops s
  WHERE s.owner_id = v_uid;

  v_q     := btrim(COALESCE(p_query, ''));
  -- Hard ceiling. This is the only thing stopping the function being used to
  -- page through the entire customer directory a few rows at a time, so it is
  -- clamped rather than trusted.
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 8), 1), 25);

  -- Every column is table-qualified: the RETURNS TABLE output parameters are
  -- named id / name / phone / email / is_shop_member, so an unqualified
  -- reference would be ambiguous with plpgsql.variable_conflict = error and
  -- the function would fail at runtime, not at creation.
  RETURN QUERY
  SELECT
    u.id,
    u.name,
    u.phone,
    u.email,
    (u.shop_id IS NOT NULL AND u.shop_id = ANY (v_shop_ids))
  FROM public.users u
  WHERE u.role = 'customer'
    AND (
      v_q = ''
      OR u.name ILIKE '%' || v_q || '%'
      OR COALESCE(u.phone, '') ILIKE '%' || v_q || '%'
      OR u.email ILIKE '%' || v_q || '%'
    )
  ORDER BY
    CASE
      WHEN v_q <> '' AND lower(u.name) = lower(v_q)      THEN 0
      WHEN v_q <> '' AND u.name ILIKE v_q || '%'          THEN 1
      WHEN v_q = ''                                       THEN 0
      ELSE 2
    END,
    u.created_at DESC,
    u.name
  LIMIT v_limit;
END;
$$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, which would let `anon`
-- (and therefore the public sign-up page) call this. Narrow it to signed-in
-- users; the role check inside rejects non-owners from there.
REVOKE EXECUTE ON FUNCTION public.search_registered_customers(TEXT, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.search_registered_customers(TEXT, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.search_registered_customers(TEXT, INTEGER) IS
  'Owner/admin-only search over every role=''customer'' account on MotoLink. Returns id, name, phone, email and whether the customer already belongs to the caller''s shop. Bypasses `users` RLS via SECURITY DEFINER, so it deliberately returns only these five columns.';


-- ── B) Let owners read back the customers they have served ───────────────────

DROP POLICY IF EXISTS "Shop owners can view customers they serve" ON public.users;

CREATE POLICY "Shop owners can view customers they serve"
  ON public.users FOR SELECT USING (
    role = 'customer'
    AND EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.customer_id = public.users.id
        AND a.shop_id IN (SELECT id FROM public.shops WHERE owner_id = auth.uid())
    )
  );

COMMENT ON POLICY "Shop owners can view customers they serve" ON public.users IS
  'Lets an owner read the profile of any customer they have an appointment for, regardless of customers.shop_id. Required so the `customer:users!customer_id` embeds resolve for globally-registered customers. Restricted to role=''customer'' so no owner or mechanic row is exposed cross-tenant.';

-- No recursion risk: the appointments policies key off customer_id /
-- shop_id / public.is_admin(), and is_admin() is SECURITY DEFINER, so nothing
-- in that chain re-enters the users policies.
-- The explicit a.shop_id IN (...) also means this does not depend on the
-- appointments policies being applied inside a policy expression.
-- ---------------------------------------------------------------------------

