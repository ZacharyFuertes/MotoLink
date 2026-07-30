import { createClient } from "@supabase/supabase-js";

// @ts-ignore - Vite environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
// @ts-ignore - Vite environment variables
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate environment variables
if (!supabaseUrl) {
  console.error("❌ VITE_SUPABASE_URL is not set in .env.local");
}
if (!supabaseAnonKey) {
  console.error("❌ VITE_SUPABASE_ANON_KEY is not set in .env.local");
}

// Create and export Supabase client
export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "");
console.log("✅ Supabase client initialized on app startup");

/**
 * Test database connection with detailed error messages
 * Use this to verify Supabase is properly connected
 */
export const testDatabaseConnection = async () => {
  try {
    console.log("🔄 Testing Supabase connection...");
    console.log("📍 URL:", supabaseUrl);
    console.log("📍 Env vars loaded:", !!supabaseUrl && !!supabaseAnonKey);

    // Try to fetch from users table with correct PostgREST syntax
    const { error } = await supabase.from("users").select("id").limit(1);

    if (error) {
      console.error("❌ Database Error Details:");
      console.error("   Message:", error.message);
      console.error("   Code:", error.code);
      console.error("   Details:", error.details);
      console.error("   Hint:", error.hint);
      return false;
    }

    console.log("✅ Supabase connected successfully!");
    console.log("📊 Users table accessible");
    return true;
  } catch (err) {
    console.error("❌ Connection failed:", err);
    return false;
  }
};

export default supabase;

/*
  Supabase RLS policy examples for strict RBAC enforcement:

  -- users table: only owner can manage staff and customers
  CREATE POLICY "Owners can manage users" ON public.users
  FOR ALL
  USING (auth.role() = 'authenticated' AND (select role from public.users where id = auth.uid()) = 'owner');

  -- parts table: owner full CRUD, mechanic read-only, customer none
  CREATE POLICY "Owners can full part operations" ON public.parts
  FOR ALL
  USING (exists (select 1 from public.users where id = auth.uid() and role = 'owner'));

  CREATE POLICY "Mechanics can view parts" ON public.parts
  FOR SELECT
  USING (exists (select 1 from public.users where id = auth.uid() and role = 'mechanic'));

  -- appointments: owner sees all, mechanic sees assigned, customer sees own
  CREATE POLICY "Owner can manage all appointments" ON public.appointments
  FOR ALL
  USING (exists (select 1 from public.users where id = auth.uid() and role = 'owner'));

  CREATE POLICY "Mechanic can access assigned appointments" ON public.appointments
  FOR SELECT, UPDATE
  USING (exists (select 1 from public.users where id = auth.uid() and role = 'mechanic') AND mechanic_id = auth.uid());

  CREATE POLICY "Customer can access own appointments" ON public.appointments
  FOR SELECT, INSERT
  USING (exists (select 1 from public.users where id = auth.uid() and role = 'customer') AND customer_id = auth.uid());

  -- job_orders: owner full, mechanic own only
  CREATE POLICY "Job order owner access" ON public.job_orders
  FOR ALL
  USING (exists (select 1 from public.users where id = auth.uid() and role = 'owner'));

  CREATE POLICY "Mechanic can update own job orders" ON public.job_orders
  FOR SELECT, UPDATE
  USING (exists (select 1 from public.users where id = auth.uid() and role = 'mechanic') AND mechanic_id = auth.uid());
*/
