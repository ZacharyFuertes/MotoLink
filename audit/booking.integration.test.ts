import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Pool, PoolClient } from "pg";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const env = {
  databaseUrl: process.env.TEST_DATABASE_URL,
  supabaseUrl: process.env.TEST_SUPABASE_URL,
  anonKey: process.env.TEST_ANON_KEY,
  serviceKey: process.env.TEST_SERVICE_KEY,
};
const configured = Object.values(env).every(Boolean);
const localHosts = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);

function assertDisposableUrl(raw: string, label: string) {
  const url = new URL(raw);
  if (!localHosts.has(url.hostname.toLowerCase())) {
    throw new Error(`${label} must resolve to localhost/a local Supabase stack. Refusing non-local database/API URL.`);
  }
  if (/prod(uction)?|live/i.test(`${url.hostname}/${url.pathname}/${url.search}`)) {
    throw new Error(`${label} looks like production. Refusing to run destructive fixtures.`);
  }
}

if (env.databaseUrl) assertDisposableUrl(env.databaseUrl, "TEST_DATABASE_URL");
if (env.supabaseUrl) assertDisposableUrl(env.supabaseUrl, "TEST_SUPABASE_URL");

const suite = configured ? describe : describe.skip;

type Fixture = {
  pool: Pool;
  admin: SupabaseClient;
  owner: SupabaseClient;
  customer: SupabaseClient;
  otherCustomer: SupabaseClient;
  ownerId: string;
  customerId: string;
  otherCustomerId: string;
  shopId: string;
  mechanicIds: [string, string];
  serviceId: string;
  categoryId: string;
  unmappedCategoryId: string;
  mappedPartId: string;
  unmappedPartId: string;
  testDate: string;
};

let f: Fixture;
let fixtureEmails: string[] = [];
let cleanupPool: Pool | undefined;
let cleanupAdmin: SupabaseClient | undefined;
let cleanupShopId: string | undefined;
const password = "Audit-Only-Password-27!";

const nextMonday = () => {
  const date = new Date();
  date.setDate(date.getDate() + ((8 - date.getDay()) % 7 || 7));
  return date.toISOString().slice(0, 10);
};

async function createAuthUser(admin: SupabaseClient, role: string, suffix: string) {
  const email = `motolink-audit-${Date.now()}-${suffix}@example.test`;
  fixtureEmails.push(email);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: `Audit ${suffix}`, role },
  });
  if (error || !data.user) throw error || new Error(`Could not create fixture user ${suffix}`);
  return { id: data.user.id, email };
}

async function signIn(url: string, anonKey: string, email: string) {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

async function asRole<T>(client: PoolClient, userId: string, fn: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE authenticated");
  await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId]);
  await client.query("SELECT set_config('request.jwt.claim.role', 'authenticated', true)");
  try {
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function insertAppointment(options: {
  mechanicId?: string | null;
  start: string;
  duration?: number;
  status?: string;
  customerId?: string | null;
  preference?: "specific" | "any";
  requestId?: string;
  parts?: unknown[];
  serviceIds?: string[];
}) {
  const client = await f.pool.connect();
  try {
    return await asRole(client, f.ownerId, async () => {
      const { rows } = await client.query(
        `INSERT INTO public.appointments
          (customer_id, shop_id, mechanic_id, mechanic_preference, scheduled_date, scheduled_time,
           duration_minutes, service_type, status, walk_in_name, walk_in_phone, client_request_id,
           service_ids, parts)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'Audit service',$8,CASE WHEN $1::uuid IS NULL THEN 'Audit walk-in' END,
           CASE WHEN $1::uuid IS NULL THEN '09990000000' END,$9,$10::uuid[],$11::jsonb)
         RETURNING id, booking_id, status, mechanic_id, mechanic_preference`,
        [options.customerId ?? null, f.shopId, options.mechanicId ?? null, options.preference ?? (options.mechanicId ? "specific" : "any"), f.testDate, options.start,
          options.duration ?? 30, options.status ?? "pending", options.requestId ?? null, options.serviceIds ?? [], JSON.stringify(options.parts ?? [])],
      );
      return rows[0] as { id: string; booking_id: string; status: string; mechanic_id: string | null; mechanic_preference: string };
    });
  } finally { client.release(); }
}

async function deleteAppointments() {
  if (f?.shopId) await f.pool.query("DELETE FROM public.appointments WHERE shop_id = $1", [f.shopId]);
}

suite("MotoLink disposable booking integration", () => {
  beforeAll(async () => {
    if (!configured) throw new Error("Set TEST_DATABASE_URL, TEST_SUPABASE_URL, TEST_ANON_KEY, and TEST_SERVICE_KEY to a disposable local Supabase stack.");
    const pool = new Pool({ connectionString: env.databaseUrl, max: 12, application_name: "motolink-booking-audit" });
    const admin = createClient(env.supabaseUrl!, env.serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    cleanupPool = pool;
    cleanupAdmin = admin;

    const owner = await createAuthUser(admin, "owner", "owner");
    const customer = await createAuthUser(admin, "customer", "customer");
    const otherCustomer = await createAuthUser(admin, "customer", "other-customer");
    const mechanics = [await createAuthUser(admin, "mechanic", "mechanic-a"), await createAuthUser(admin, "mechanic", "mechanic-b")];

    const profiles = [
      { id: owner.id, email: owner.email, name: "Audit owner", role: "owner" },
      { id: customer.id, email: customer.email, name: "Audit customer", role: "customer" },
      { id: otherCustomer.id, email: otherCustomer.email, name: "Audit other customer", role: "customer" },
      ...mechanics.map((m, i) => ({ id: m.id, email: m.email, name: `Audit mechanic ${i + 1}`, role: "mechanic" })),
    ];
    const { error: profileError } = await admin.from("users").upsert(profiles, { onConflict: "id" });
    if (profileError) throw profileError;

    const { data: shop, error: shopError } = await admin.from("shops").insert({
      owner_id: owner.id, name: "Disposable booking audit shop", slug: `booking-audit-${Date.now()}`,
      description: "Disposable integration fixture", address: "Local test", city: "Test",
      latitude: 14.6, longitude: 121.0, operating_hours: "Monday: 08:00-18:00", is_active: true,
    }).select("id").single();
    if (shopError || !shop) throw shopError || new Error("Shop fixture was not created");
    cleanupShopId = shop.id;
    const { error: mechanicLinkError } = await admin.from("users").update({ shop_id: shop.id }).in("id", mechanics.map((m) => m.id));
    if (mechanicLinkError) throw mechanicLinkError;

    const { data: service, error: serviceError } = await admin.from("services_pricing").insert({
      shop_id: shop.id, label: "Audit service", description: "Disposable fixture", price: 100, duration_minutes: 30, is_active: true,
    }).select("id").single();
    if (serviceError || !service) throw serviceError || new Error("Service fixture was not created");
    const { data: category, error: categoryError } = await admin.from("part_categories").insert({ shop_id: shop.id, name: "Audit category" }).select("id").single();
    if (categoryError || !category) throw categoryError || new Error("Part category fixture was not created");
    const { data: unmappedCategory, error: unmappedCategoryError } = await admin.from("part_categories").insert({ shop_id: shop.id, name: "Unmapped audit category" }).select("id").single();
    if (unmappedCategoryError || !unmappedCategory) throw unmappedCategoryError || new Error("Unmapped category fixture was not created");
    const { data: parts, error: partError } = await admin.from("parts").insert([
      { shop_id: shop.id, category_id: category.id, name: "Mapped audit part", category: "Audit category", quantity_in_stock: 20, unit_price: 10, is_active: true },
      { shop_id: shop.id, category_id: unmappedCategory.id, name: "Unmapped audit part", category: "Unmapped audit category", quantity_in_stock: 20, unit_price: 10, is_active: true },
      { shop_id: shop.id, category_id: category.id, name: "Out of stock audit part", category: "Audit category", quantity_in_stock: 0, unit_price: 10, is_active: true },
    ]).select("id");
    if (partError || !parts || parts.length !== 3) throw partError || new Error("Part fixtures were not created");
    const { error: mappingError } = await admin.from("service_part_categories").insert({ shop_id: shop.id, service_id: service.id, part_category_id: category.id });
    if (mappingError) throw mappingError;
    await admin.from("users").update({ shop_id: shop.id }).eq("id", owner.id);

    // Schedule both mechanics for the ISO Monday corresponding to testDate.
    const testDate = nextMonday();
    const { error: shiftError } = await admin.from("mechanic_availability").insert(mechanics.map((m) => ({
      mechanic_id: m.id, shop_id: shop.id, day_of_week: 0, start_time: "08:00", end_time: "18:00", is_available: true,
    })));
    if (shiftError) throw shiftError;

    f = {
      pool, admin, owner: await signIn(env.supabaseUrl!, env.anonKey!, owner.email),
      customer: await signIn(env.supabaseUrl!, env.anonKey!, customer.email),
      otherCustomer: await signIn(env.supabaseUrl!, env.anonKey!, otherCustomer.email),
      ownerId: owner.id, customerId: customer.id, otherCustomerId: otherCustomer.id, shopId: shop.id,
      mechanicIds: [mechanics[0].id, mechanics[1].id], serviceId: service.id, categoryId: category.id,
      unmappedCategoryId: unmappedCategory.id, mappedPartId: parts[0].id, unmappedPartId: parts[1].id, testDate,
    };
  }, 60_000);

  afterEach(async () => { await deleteAppointments(); });

  afterAll(async () => {
    if (cleanupShopId && cleanupAdmin) await cleanupAdmin.from("shops").delete().eq("id", cleanupShopId);
    for (const email of fixtureEmails) {
      const { data } = await cleanupAdmin!.from("users").select("id").eq("email", email).maybeSingle();
      if (data?.id) await cleanupAdmin!.auth.admin.deleteUser(data.id);
    }
    await cleanupPool?.end();
  }, 60_000);

  it("reports installed range type, half-open bounds and active-status predicate", async () => {
    const { rows } = await f.pool.query(`
      SELECT pg_get_constraintdef(oid, true) AS definition
      FROM pg_constraint WHERE conrelid='public.appointments'::regclass
        AND conname='appointments_mechanic_no_overlapping_active_appointments'`);
    expect(rows).toHaveLength(1);
    const def = rows[0].definition as string;
    expect(def).toContain("tsrange(");
    expect(def).toContain("'[)'");
    expect(def).toContain("pending");
    expect(def).toContain("confirmed");
    expect(def).toContain("in_progress");
    expect(def).toContain("mechanic_id IS NOT NULL");
  });

  it("enforces two-unit capacity for unassigned overlaps and assigned+unassigned mix", async () => {
    await insertAppointment({ start: "09:00" });
    await insertAppointment({ start: "09:00" });
    await expect(insertAppointment({ start: "09:00" })).rejects.toThrow(/capacity|overlap|exclusion/i);
    await deleteAppointments();
    await insertAppointment({ mechanicId: f.mechanicIds[0], start: "10:00" });
    await insertAppointment({ start: "10:00" });
    await expect(insertAppointment({ start: "10:00" })).rejects.toThrow(/capacity|overlap|exclusion/i);
  });

  it("allows adjacent intervals and rejects a one-minute overlap", async () => {
    await insertAppointment({ mechanicId: f.mechanicIds[0], start: "11:00", duration: 60 });
    await expect(insertAppointment({ mechanicId: f.mechanicIds[0], start: "12:00", duration: 60 })).resolves.toBeTruthy();
    await expect(insertAppointment({ mechanicId: f.mechanicIds[0], start: "11:59", duration: 30 })).rejects.toThrow(/overlap|exclusion/i);
  });

  it("rejects duplicate online request IDs with one persisted booking", async () => {
    const requestId = crypto.randomUUID();
    const first = await insertAppointment({ customerId: f.customerId, start: "10:00", requestId });
    await expect(insertAppointment({ customerId: f.customerId, start: "11:00", requestId })).rejects.toThrow(/duplicate|unique/i);
    const { rows } = await f.pool.query("SELECT count(*)::int AS count FROM public.appointments WHERE client_request_id=$1", [requestId]);
    expect(first.id).toBeTruthy();
    expect(rows[0].count).toBe(1);
  });

  it("serializes ten concurrent inserts for one mechanic to exactly one success", async () => {
    const results = await Promise.allSettled(Array.from({ length: 10 }, async () => {
      const client = await f.pool.connect();
      try {
        return await asRole(client, f.ownerId, async () => {
          const { rows } = await client.query(`INSERT INTO public.appointments
            (customer_id,shop_id,mechanic_id,mechanic_preference,scheduled_date,scheduled_time,duration_minutes,service_type,status)
            VALUES (NULL,$1,$2,'specific',$3,'13:00',30,'race','pending') RETURNING id`, [f.shopId, f.mechanicIds[0], f.testDate]);
          return rows[0];
        });
      } finally { client.release(); }
    }));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });

  it("limits ten concurrent unassigned inserts to the two-mechanic capacity", async () => {
    const results = await Promise.allSettled(Array.from({ length: 10 }, async () => {
      const client = await f.pool.connect();
      try {
        return await asRole(client, f.ownerId, async () => {
          const { rows } = await client.query(`INSERT INTO public.appointments
            (customer_id,shop_id,mechanic_preference,scheduled_date,scheduled_time,duration_minutes,service_type,status,walk_in_name,walk_in_phone)
            VALUES (NULL,$1,'any',$2,'14:00',30,'race','pending','Audit guest','09991112222') RETURNING id`, [f.shopId, f.testDate]);
          return rows[0];
        });
      } finally { client.release(); }
    }));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(2);
  });

  it("rejects customer confirmed/other-customer inserts, hides other rows, and permits own cancellation", async () => {
    const confirmed = await f.customer.from("appointments").insert({ customer_id: f.customerId, shop_id: f.shopId, scheduled_date: f.testDate, scheduled_time: "08:00", duration_minutes: 30, service_type: "api", status: "confirmed" });
    expect(confirmed.error).not.toBeNull();
    const other = await f.customer.from("appointments").insert({ customer_id: f.otherCustomerId, shop_id: f.shopId, scheduled_date: f.testDate, scheduled_time: "08:00", duration_minutes: 30, service_type: "api", status: "pending" });
    expect(other.error).not.toBeNull();
    const otherOwnBooking = await f.otherCustomer.from("appointments").insert({ customer_id: f.otherCustomerId, shop_id: f.shopId, scheduled_date: f.testDate, scheduled_time: "08:00", duration_minutes: 30, service_type: "other customer own", status: "pending" }).select("id").single();
    expect(otherOwnBooking.error).toBeNull();
    const own = await f.customer.from("appointments").insert({ customer_id: f.customerId, shop_id: f.shopId, scheduled_date: f.testDate, scheduled_time: "08:00", duration_minutes: 30, service_type: "api", status: "pending" }).select("id").single();
    expect(own.error).toBeNull();
    const updateOther = await f.customer.from("appointments").update({ status: "cancelled" }).eq("id", otherOwnBooking.data!.id);
    expect(updateOther.error).toBeNull();
    expect(updateOther.data).toBeNull();
    const unchanged = await f.admin.from("appointments").select("status").eq("id", otherOwnBooking.data!.id).single();
    expect(unchanged.data!.status).toBe("pending");
    const cancel = await f.customer.rpc("cancel_customer_appointment", { p_appointment_id: own.data!.id });
    expect(cancel.error).toBeNull();
  });

  it("enforces mapped part, stock and quantity validation server-side", async () => {
    const base = { shop_id: f.shopId, scheduled_date: f.testDate, scheduled_time: "15:00", duration_minutes: 30, service_type: "parts", status: "pending", service_ids: [f.serviceId] };
    const unmapped = await f.owner.from("appointments").insert({ ...base, parts: [{ part_id: f.unmappedPartId, part_name: "Unmapped", unit_price: 10, quantity: 1 }] });
    expect(unmapped.error).not.toBeNull();
    const outOfStock = await f.owner.from("appointments").insert({ ...base, parts: [{ part_id: (await f.admin.from("parts").select("id").eq("name", "Out of stock audit part").single()).data!.id, part_name: "Empty", unit_price: 10, quantity: 1 }] });
    expect(outOfStock.error).not.toBeNull();
    const tooMany = await f.owner.from("appointments").insert({ ...base, parts: [{ part_id: f.mappedPartId, part_name: "Mapped", unit_price: 10, quantity: 21 }] });
    expect(tooMany.error).not.toBeNull();
    const tampered = await f.owner.from("appointments").insert({ ...base, parts: [{ part_id: "not-a-uuid", part_name: "Tampered", unit_price: 10, quantity: 1 }] });
    expect(tampered.error).not.toBeNull();
  });

  it("decrements mapped part stock only once when an owner confirms", async () => {
    const before = await f.admin.from("parts").select("quantity_in_stock").eq("id", f.mappedPartId).single();
    const appointment = await f.owner.from("appointments").insert({ customer_id: f.customerId, ...{
      shop_id: f.shopId, mechanic_id: f.mechanicIds[0], mechanic_preference: "specific", scheduled_date: f.testDate,
      scheduled_time: "16:00", duration_minutes: 30, service_type: "parts", status: "pending", service_ids: [f.serviceId],
      parts: [{ part_id: f.mappedPartId, part_name: "Mapped audit part", unit_price: 10, quantity: 2 }],
    }}).select("id").single();
    expect(appointment.error).toBeNull();
    const confirmed = await f.owner.from("appointments").update({ status: "confirmed" }).eq("id", appointment.data!.id);
    expect(confirmed.error).toBeNull();
    await f.owner.from("appointments").update({ status: "confirmed" }).eq("id", appointment.data!.id);
    const after = await f.admin.from("parts").select("quantity_in_stock").eq("id", f.mappedPartId).single();
    expect(after.data!.quantity_in_stock).toBe(before.data!.quantity_in_stock - 2);
  });

  it("returns free mechanics and next slot from the shared availability RPC", async () => {
    const { data, error } = await f.customer.rpc("get_booking_availability", {
      p_shop_id: f.shopId, p_scheduled_date: f.testDate, p_start_times: ["08:00"], p_duration_minutes: 30,
    });
    expect(error).toBeNull();
    expect(data?.[0].available_mechanic_ids).toEqual(expect.arrayContaining(f.mechanicIds));
    expect(data?.[0]).toHaveProperty("next_free_slot");
    expect(data?.[0]).toHaveProperty("next_free_mechanic_ids");
  });

  it("resolves pending conflicts, rejects confirmed-specific reassignment, allows confirmed-any, and protects in-progress", async () => {
    const makeWalkIn = (mechanicId: string) => ({
      customer_id: null, mechanic_id: mechanicId, mechanic_preference: "specific", scheduled_date: f.testDate,
      scheduled_time: "17:00", duration_minutes: 30, service_type: "Audit walk-in", walk_in_name: "Audit guest", walk_in_phone: "09990000000",
    });
    const resolve = (payload: Record<string, unknown>, resolution: Record<string, unknown>[]) => f.owner.rpc("resolve_walk_in_conflict", {
      p_shop_id: f.shopId, p_walk_in: payload, p_resolutions: resolution, p_request_id: crypto.randomUUID(),
    });

    const pending = await insertAppointment({ customerId: f.customerId, mechanicId: f.mechanicIds[0], start: "17:00", status: "pending" });
    const pendingResult = await resolve(makeWalkIn(f.mechanicIds[0]), [{ appointment_id: pending.id, action: "reassign_online", replacement_mechanic_id: f.mechanicIds[1] }]);
    expect(pendingResult.error).toBeNull();
    expect(pendingResult.data?.affected_appointment_ids).toContain(pending.id);
    await deleteAppointments();

    const confirmedSpecific = await insertAppointment({ customerId: f.customerId, mechanicId: f.mechanicIds[0], start: "17:00", status: "confirmed", preference: "specific" });
    const deniedSpecific = await resolve(makeWalkIn(f.mechanicIds[0]), [{ appointment_id: confirmedSpecific.id, action: "reassign_online", replacement_mechanic_id: f.mechanicIds[1] }]);
    expect(deniedSpecific.error).not.toBeNull();
    await deleteAppointments();

    const confirmedForReschedule = await insertAppointment({ customerId: f.customerId, mechanicId: f.mechanicIds[0], start: "17:00", status: "confirmed", preference: "specific" });
    const rescheduledDate = new Date(`${f.testDate}T00:00:00`);
    rescheduledDate.setDate(rescheduledDate.getDate() + 7);
    const rescheduled = await resolve(makeWalkIn(f.mechanicIds[0]), [{
      appointment_id: confirmedForReschedule.id, action: "reschedule_online",
      rescheduled_date: rescheduledDate.toISOString().slice(0, 10), rescheduled_time: "12:00",
      rescheduled_mechanic_id: f.mechanicIds[1], reason: "QA reschedule reason",
    }]);
    expect(rescheduled.error).toBeNull();
    await deleteAppointments();

    const confirmedAny = await insertAppointment({ customerId: f.customerId, mechanicId: f.mechanicIds[0], start: "17:00", status: "confirmed", preference: "any" });
    const allowedAny = await resolve(makeWalkIn(f.mechanicIds[0]), [{ appointment_id: confirmedAny.id, action: "reassign_online", replacement_mechanic_id: f.mechanicIds[1] }]);
    expect(allowedAny.error).toBeNull();
    await deleteAppointments();

    await insertAppointment({ customerId: f.customerId, mechanicId: f.mechanicIds[0], start: "17:00", status: "in_progress" });
    const inProgress = await resolve(makeWalkIn(f.mechanicIds[0]), []);
    expect(inProgress.error).not.toBeNull();
  });

  it("replays a walk-in request UUID without creating a second appointment", async () => {
    const requestId = crypto.randomUUID();
    const payload = { customer_id: null, mechanic_id: null, mechanic_preference: "any", scheduled_date: f.testDate,
      scheduled_time: "08:00", duration_minutes: 30, service_type: "Audit walk-in", walk_in_name: "Audit guest", walk_in_phone: "09990000000" };
    const args = { p_shop_id: f.shopId, p_walk_in: payload, p_resolutions: [], p_request_id: requestId };
    const one = await f.owner.rpc("resolve_walk_in_conflict", args);
    const two = await f.owner.rpc("resolve_walk_in_conflict", args);
    expect(one.error).toBeNull();
    expect(two.error).toBeNull();
    expect(two.data.appointment.id).toBe(one.data.appointment.id);
    const { rows } = await f.pool.query("SELECT count(*)::int AS count FROM public.appointments WHERE shop_id=$1 AND walk_in_request_id=$2", [f.shopId, requestId]);
    expect(rows[0].count).toBe(1);
  });
});
