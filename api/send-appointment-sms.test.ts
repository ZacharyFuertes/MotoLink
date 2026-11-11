import { beforeEach, describe, expect, it, vi } from "vitest";

const dbState = {
  from: vi.fn(),
};
const authGetUser = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: authGetUser },
    from: dbState.from,
  })),
}));

vi.mock("./_lib/textbee.js", () => ({
  buildAppointmentStatusSms: vi.fn(() => "Status update text"),
  isSmsDeliveryLogUnavailable: vi.fn(() => false),
  isSmsEventKeyUnavailable: vi.fn(() => false),
  normalizeSmsPhone: vi.fn(() => "+639171234567"),
  sendTextbeeSms: vi.fn(async () => ({ kind: "accepted", smsBatchId: "batch-123" })),
  AppointmentSmsStatus: {},
}));

describe("customer appointment SMS endpoint", () => {
  let handler: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    vi.stubEnv("TEXTBEE_API_KEY", "textbee-key");
    vi.stubEnv("TEXTBEE_DEVICE_ID", "device-123");
    authGetUser.mockResolvedValue({
      data: { user: { id: "user-1", role: "owner" } },
      error: null,
    });
    ({ default: handler } = await import("./send-appointment-sms"));
  });

  it("reports skipped customer SMS as unsuccessful instead of pretending it was sent", async () => {
    const res = {
      status: vi.fn().mockImplementation(() => ({
        json: (body: any) => body,
      })),
    } as any;

    const appointmentQuery = vi.fn().mockResolvedValue({
      data: {
        id: "appt-1",
        booking_id: "BK-1",
        customer_id: "customer-1",
        walk_in_name: null,
        walk_in_phone: null,
        walk_in_sms_consent: false,
        walk_in_sms_consent_at: null,
        shop_id: "shop-1",
        status: "confirmed",
        scheduled_date: "2026-11-12",
        scheduled_time: "09:00",
      },
      error: null,
    });
    const shopQuery = vi.fn().mockResolvedValue({ data: { id: "shop-1", name: "MotoLink Garage", owner_id: "user-1" }, error: null });
    const settingsQuery = vi.fn().mockResolvedValue({ data: null, error: null });
    dbState.from.mockImplementation((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn((cols: string) => ({
            eq: vi.fn((field: string, value: string) => ({
              maybeSingle: vi.fn().mockResolvedValue(
                field === "id" && value === "customer-1"
                  ? { data: { id: "customer-1", name: "Mina", phone: "09171234567" }, error: null }
                  : { data: { id: "user-1", role: "owner" }, error: null },
              ),
            })),
          })),
        };
      }
      if (table === "appointments") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: appointmentQuery,
            })),
          })),
        };
      }
      if (table === "shops") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: shopQuery,
            })),
          })),
        };
      }
      if (table === "customer_notification_settings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: settingsQuery,
            })),
          })),
        };
      }
      if (table === "appointment_sms_deliveries") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: { id: "delivery-1" }, error: null }),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await handler({
      method: "POST",
      body: { appointmentId: "appt-1", status: "confirmed", accessToken: "token-1" },
    }, res);

    expect(result.success).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("sms_consent_missing");
  });
});
