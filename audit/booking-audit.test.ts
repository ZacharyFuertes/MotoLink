import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261103_booking_concurrency_and_consent_guards.sql");
const conflictMigration = read("../supabase/migrations/20261101_handle_walk_in_booking_conflict.sql");
const online = read("../src/components/BookAppointmentModal.tsx");
const walkIn = read("../src/components/WalkInBookingModal.tsx");
const conflictModal = read("../src/components/ConflictResolutionModal.tsx");

describe("MotoLink booking audit safeguards (source-contract tests)", () => {
  it("keeps the active mechanic exclusion constraint as a half-open tsrange and omits unassigned rows", () => {
    expect(conflictMigration).toContain("EXCLUDE USING gist (");
    expect(conflictMigration).toContain("tsrange(");
    expect(conflictMigration).toContain("'[)'");
    expect(conflictMigration).toContain(") WITH &&");
    expect(conflictMigration).toContain("WHERE (mechanic_id IS NOT NULL AND status IN ('pending', 'confirmed', 'in_progress'))");
  });

  it("limits unassigned overlapping bookings to on-shift mechanic capacity under a shop/day lock", () => {
    expect(migration).toContain("appointments_00_serialize_shop_day");
    expect(migration).toContain("hashtext(NEW.scheduled_date::TEXT)");
    expect(migration).toContain("v_active_appointments >= v_shift_capacity");
    expect(migration).toContain("NEW.mechanic_id IS NOT NULL OR NEW.status NOT IN ('pending', 'confirmed', 'in_progress')");
  });

  it("uses one shared availability RPC in both booking flows", () => {
    expect(online).toContain('rpc("get_booking_availability"');
    expect(walkIn).toContain('rpc("get_booking_availability"');
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.get_booking_availability");
    expect(migration).toContain("available_mechanic_ids UUID[]");
    expect(migration).toContain("next_free_slot TIME");
    expect(walkIn).toContain("nextFreeOptions[selectedSlot]");
  });

  it("persists online request IDs and enforces per-customer uniqueness", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS client_request_id UUID");
    expect(migration).toContain("ON public.appointments(customer_id, client_request_id)");
    expect(online).toContain("client_request_id: clientRequestRef.current.id");
    expect(online).toContain("clientRequestRef.current.fingerprint");
  });

  it("prevents customer API inserts as confirmed or for another customer and limits updates", () => {
    expect(migration).toContain("Customers may create only their own pending appointments.");
    expect(migration).toContain("NEW.customer_id IS DISTINCT FROM auth.uid() OR NEW.status <> 'pending'");
    expect(migration).toContain("Customers may only cancel their own pending appointment.");
    expect(migration).toContain("to_jsonb(NEW) - ARRAY['status', 'updated_at']");
  });

  it("preserves specific-vs-any preference and protects confirmed specific and in-progress appointments", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS mechanic_preference TEXT NOT NULL DEFAULT 'specific'");
    expect(migration).toContain("CASE WHEN mechanic_id IS NULL THEN 'any' ELSE 'specific' END");
    expect(migration).toContain("OLD.status = 'confirmed'");
    expect(migration).toContain("OLD.mechanic_preference = 'specific'");
    expect(migration).toContain("In-progress appointments cannot be reassigned or rescheduled.");
    expect(conflictModal).toContain("conflict.mechanic_preference === \"any\"");
  });

  it("records conflict resolutions and restricts log reads to shop owners/admins", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.conflict_resolution_log");
    expect(migration).toContain("conflict_resolution_log_owner_admin_read");
    expect(migration).toContain("public.is_admin()");
    expect(migration).toContain("INSERT INTO public.conflict_resolution_log");
    expect(migration).toContain("old_scheduled_date, old_scheduled_time, new_scheduled_date, new_scheduled_time");
  });

  it("revalidates restored guest services, parts, shop hours, slot and mechanic before confirm", () => {
    expect(online).toContain("restoredDraftPending");
    expect(online).toContain("One or more saved services are no longer active at this shop.");
    expect(online).toContain("validateSelectedServiceParts(resolvedShopId, selectedServices, selectedParts)");
    expect(online).toContain("get_booking_availability");
    expect(online).toContain("restoredDraftPending}");
  });

  it("guards the existing walk-in conflict RPC without dropping existing constraints or triggers", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.resolve_walk_in_conflict_with_parts");
    expect(migration).toContain("public.resolve_walk_in_conflict(p_shop_id, p_walk_in, p_resolutions, p_request_id)");
    expect(migration).not.toMatch(/DROP\s+(?:TRIGGER|CONSTRAINT)/i);
  });
});
