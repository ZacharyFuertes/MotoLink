import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261110000100_textbee_sms_notifications.sql");
const eventMigration = read("../supabase/migrations/20261112000200_appointment_cancellation_reschedule_sms.sql");
const endpoint = read("../api/send-appointment-sms.ts");
const ownerEndpoint = read("../api/send-owner-appointment-sms.ts");
const lowStockEndpoint = read("../api/send-low-stock-alert.ts");
const ownerMigration = read("../supabase/migrations/20261111000100_owner_sms_alerts.sql");
const page = read("../src/pages/AppointmentCalendarPage.tsx");
const booking = read("../src/components/BookAppointmentModal.tsx");
const shopSettings = read("../src/pages/ShopSettingsPage.tsx");
const settings = read("../src/components/CustomerSettingsModal.tsx");
const walkIn = read("../src/components/WalkInBookingModal.tsx");

describe("Textbee appointment SMS source safeguards", () => {
  it("limits SMS to supported lifecycle events and requires persisted state", () => {
    expect(endpoint).toContain('["confirmed", "in_progress", "completed", "cancelled", "rescheduled"]');
    expect(endpoint).toContain("appointment.status !== status");
    expect(page).toContain('newStatus === "confirmed" || newStatus === "in_progress" || newStatus === "completed"');
    expect(page).toContain('newStatus === "cancelled"');
    expect(endpoint).toContain("isCustomerCancellation");
    expect(endpoint).toContain("rescheduled:${appointment.scheduled_date}:${appointment.scheduled_time}");
    expect(endpoint).toContain("isSmsEventKeyUnavailable(error)");
    expect(endpoint).toContain('.from("customers")');
    expect(endpoint).toContain('.eq("user_id", recipientId)');
    expect(endpoint).toContain("Customer SMS was not sent because delivery logging is unavailable.");
    expect(eventMigration).toContain("UNIQUE (appointment_id, event_key)");
    expect(eventMigration).toContain("'cancelled', 'rescheduled'");
    expect(eventMigration).toContain("ADD COLUMN IF NOT EXISTS event_key TEXT");
    expect(eventMigration).toContain("DROP CONSTRAINT IF EXISTS appointment_sms_deliveries_appointment_id_event_key_key");
  });

  it("requires customer opt-in or explicit walk-in consent", () => {
    expect(endpoint).toContain("sms_notifications_enabled");
    expect(endpoint).toContain("appointment.walk_in_sms_consent === true");
    expect(endpoint).toContain("if (!consent) return skip(");
    expect(settings).toContain("SMS appointment status updates");
    expect(settings).toContain("sms_notifications_enabled: smsEnabled");
    expect(walkIn).toContain("walk_in_sms_consent: customerId ? false : walkInSmsConsent");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS walk_in_sms_consent BOOLEAN NOT NULL DEFAULT false");
  });

  it("deduplicates sends by appointment and status and keeps the Textbee key server-side", () => {
    expect(migration).toContain("UNIQUE (appointment_id, target_status)");
    expect(migration).toContain("appointments_guard_walk_in_sms_consent");
    expect(migration).toContain("walk_in_sms_consent = v_sms_consent");
    expect(migration).toContain("REVOKE ALL ON public.appointment_sms_deliveries FROM PUBLIC, anon, authenticated");
    expect(endpoint).toContain('error?.code === "23505"');
    expect(endpoint).toContain("process.env.TEXTBEE_API_KEY");
    expect(endpoint).not.toContain("VITE_TEXTBEE_API_KEY");
    expect(endpoint).not.toContain("txb_");
  });

  it("does not make the SMS request conditional for completing an appointment", () => {
    const statusUpdateIndex = page.indexOf(".update({ status: newStatus");
    const smsIndex = page.indexOf("sendAppointmentStatusSms(appointment.id, newStatus)");
    expect(statusUpdateIndex).toBeGreaterThan(-1);
    expect(smsIndex).toBeGreaterThan(statusUpdateIndex);
  });

  it("sends cancellation and reschedule SMS only after their database operation succeeds", () => {
    const profile = read("../src/pages/UserProfilePage.tsx");
    const appointmentModal = read("../src/components/ViewAppointmentsModal.tsx");
    const walkInModal = read("../src/components/WalkInBookingModal.tsx");
    expect(profile.indexOf("await cancelCustomerAppointment(appointmentId)"))
      .toBeLessThan(profile.indexOf('sendAppointmentStatusSms(appointmentId, "cancelled")'));
    expect(appointmentModal.indexOf("await cancelCustomerAppointment(appointmentId)"))
      .toBeLessThan(appointmentModal.indexOf('sendAppointmentStatusSms(appointmentId, "cancelled")'));
    expect(walkInModal.indexOf("if (rpcError) throw rpcError"))
      .toBeLessThan(walkInModal.indexOf('sendAppointmentStatusSms(appointmentId, "rescheduled")'));
    expect(page).toContain('smsResult.reason === "sms_consent_missing"');
  });

  it("routes new appointment and low-stock SMS to the private owner phone", () => {
    expect(booking).toContain("sendOwnerNewAppointmentSms(appointment.id)");
    expect(ownerEndpoint).toContain('.select("id, phone")');
    expect(ownerEndpoint).toContain("normalizeSmsPhone(owner.phone)");
    expect(ownerEndpoint).toContain("process.env.TEXTBEE_API_KEY");
    expect(ownerEndpoint).not.toContain("VITE_TEXTBEE_API_KEY");
    expect(lowStockEndpoint).toContain("buildOwnerLowStockSms");
    expect(lowStockEndpoint).toContain("owner?.phone");
    expect(shopSettings).toContain("shop-owner-sms-phone");
    expect(shopSettings).toContain(".update({ phone: ownerSmsPhone.trim() || null })");
    expect(ownerMigration).toContain("owner_sms_deliveries");
    expect(ownerMigration).toContain("REVOKE ALL ON public.owner_sms_deliveries FROM PUBLIC, anon, authenticated");
  });
});
