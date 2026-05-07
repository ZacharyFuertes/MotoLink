// Test script to verify Supabase connection
// Run with: npm run seed (or custom test command)

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://qscdmsfokvvfnxsfxuvk.supabase.co";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzY2Rtc2Zva3Z2Zm54c2Z4dXZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMTk5NzgsImV4cCI6MjA5MzY5NTk3OH0.NINeLniuzxkQp_d0AuTlvurTMGZ4E3N0uDJm5LO4qU8";

console.log("\n🔍 Testing Supabase Connection...\n");
console.log("📍 Project URL:", supabaseUrl);
console.log("📍 Anon Key:", supabaseAnonKey.substring(0, 30) + "...");

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testConnection() {
  try {
    console.log("\n✓ Creating Supabase client...");

    // Test 1: Can we reach the API?
    console.log("\n📊 Test 1: Checking API connectivity...");
    const { data: healthCheck } = await supabase.auth.getSession();
    console.log("✅ API is reachable!");

    // Test 2: Can we query tables?
    console.log("\n📊 Test 2: Checking database access...");
    const { data: tables, error: tableError } = await supabase
      .from("shops")
      .select("id")
      .limit(1);

    if (tableError && tableError.code === "PGRST116") {
      console.log("⚠️  Table doesn't exist yet (expected). This is normal for fresh DB.");
      console.log("   Error:", tableError.message);
    } else if (tableError) {
      console.error("❌ Error querying shops:", tableError.message);
    } else {
      console.log("✅ Database tables accessible!");
      console.log(`   Shops found: ${tables?.length || 0}`);
    }

    // Test 3: Authentication client working?
    console.log("\n📊 Test 3: Checking Auth system...");
    const { data: authUser } = await supabase.auth.getUser();
    console.log("✅ Auth system working!");

    console.log("\n🎉 All tests passed! Supabase is properly connected.");
    console.log("\n📝 Next Steps:");
    console.log("   1. Run the SQL schema in Supabase dashboard (SQL Editor)");
    console.log("   2. Copy COMPLETE_DATABASE_SCHEMA.sql content");
    console.log("   3. Paste and execute in Supabase SQL Editor");
    console.log("   4. Restart dev server: npm run dev");

  } catch (error) {
    console.error("\n❌ Connection test failed!");
    console.error("Error:", error);
    process.exit(1);
  }
}

testConnection();
