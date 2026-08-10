-- ============================================================================
-- ADMIN ROLE RLS POLICIES
-- Run this in Supabase SQL Editor to grant admin full read access across all tables
-- ============================================================================

-- Helper function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- USERS: Admin can view all users
DROP POLICY IF EXISTS "Admin can view all users" ON public.users;
CREATE POLICY "Admin can view all users" ON public.users FOR SELECT USING (public.is_admin());

-- SHOPS: Admin can view all shops
DROP POLICY IF EXISTS "Admin can view all shops" ON public.shops;
CREATE POLICY "Admin can view all shops" ON public.shops FOR SELECT USING (public.is_admin());

-- SHOPS: Admin can update shops (approve pending registrations / deactivate)
DROP POLICY IF EXISTS "Admin can update all shops" ON public.shops;
CREATE POLICY "Admin can update all shops" ON public.shops FOR UPDATE USING (public.is_admin());

-- SHOPS: Admin can delete shops (cascades to parts/services/availability/appointments)
DROP POLICY IF EXISTS "Admin can delete all shops" ON public.shops;
CREATE POLICY "Admin can delete all shops" ON public.shops FOR DELETE USING (public.is_admin());

-- APPOINTMENTS: Admin can view all appointments
DROP POLICY IF EXISTS "Admin can view all appointments" ON public.appointments;
CREATE POLICY "Admin can view all appointments" ON public.appointments FOR SELECT USING (public.is_admin());

-- JOB ORDERS: Admin can view all job orders
DROP POLICY IF EXISTS "Admin can view all job orders" ON public.job_orders;
CREATE POLICY "Admin can view all job orders" ON public.job_orders FOR SELECT USING (public.is_admin());

-- PARTS: Admin can view all parts
DROP POLICY IF EXISTS "Admin can view all parts" ON public.parts;
CREATE POLICY "Admin can view all parts" ON public.parts FOR SELECT USING (public.is_admin());

-- PRODUCTS: Admin can view all products
DROP POLICY IF EXISTS "Admin can view all products" ON public.products;
CREATE POLICY "Admin can view all products" ON public.products FOR SELECT USING (public.is_admin());

-- PART SALES: Admin can view all part sales
DROP POLICY IF EXISTS "Admin can view all part sales" ON public.part_sales;
CREATE POLICY "Admin can view all part sales" ON public.part_sales FOR SELECT USING (public.is_admin());

-- INVOICES: Admin can view all invoices
DROP POLICY IF EXISTS "Admin can view all invoices" ON public.invoices;
CREATE POLICY "Admin can view all invoices" ON public.invoices FOR SELECT USING (public.is_admin());

-- RESERVATIONS: Admin can view all reservations
DROP POLICY IF EXISTS "Admin can view all reservations" ON public.reservations;
CREATE POLICY "Admin can view all reservations" ON public.reservations FOR SELECT USING (public.is_admin());

-- VEHICLES: Admin can view all vehicles
DROP POLICY IF EXISTS "Admin can view all vehicles" ON public.vehicles;
CREATE POLICY "Admin can view all vehicles" ON public.vehicles FOR SELECT USING (public.is_admin());

-- MECHANIC AVAILABILITY: Admin can view all
DROP POLICY IF EXISTS "Admin can view all mechanic availability" ON public.mechanic_availability;
CREATE POLICY "Admin can view all mechanic availability" ON public.mechanic_availability FOR SELECT USING (public.is_admin());

-- SERVICES PRICING: Admin can manage all
DROP POLICY IF EXISTS "Admin can manage all services" ON public.services_pricing;
CREATE POLICY "Admin can manage all services" ON public.services_pricing FOR ALL USING (public.is_admin());

-- NOTIFICATIONS: Admin can view all
DROP POLICY IF EXISTS "Admin can view all notifications" ON public.notifications;
CREATE POLICY "Admin can view all notifications" ON public.notifications FOR SELECT USING (public.is_admin());

-- FEATURED PRODUCTS: Admin can view all
DROP POLICY IF EXISTS "Admin can view all featured products" ON public.featured_products;
CREATE POLICY "Admin can view all featured products" ON public.featured_products FOR SELECT USING (public.is_admin());

-- JOB ORDER ITEMS: Admin can view all
DROP POLICY IF EXISTS "Admin can view all job order items" ON public.job_order_items;
CREATE POLICY "Admin can view all job order items" ON public.job_order_items FOR SELECT USING (public.is_admin());
