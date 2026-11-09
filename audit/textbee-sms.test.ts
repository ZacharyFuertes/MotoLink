import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261110000100_textbee_sms_notifications.sql");
const endpoint = read("../api/send-appointment-sms.ts");
const page = read("../src/pages/AppointmentCalendarPage.tsx");
const settings = read("../src/components/CustomerSettingsModal.tsx");
const walkIn = read("../src/components/WalkInBookingModal.tsx");

describe("Textbee appointment SMS source safeguards", () => {
  it("limits SMS to the three requested appointment states and requires persisted state", () => {
    expect(endpoint).toContain('["confirmed", "in_progress", "completed"]');
    expect(endpoint).toContain("appointment.status !== status");
    expect(page).toContain('newStatus === "confirmed" || newStatus === "in_progress" || newStatus === "completed"');
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
});
