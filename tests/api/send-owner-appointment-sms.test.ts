import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getUser: vi.fn(),
  sendTextbeeSms: vi.fn(),
  buildOwnerAppointmentStatusSms: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  })),
}));

vi.mock("../../server/textbee.js", () => ({
  buildOwnerAppointmentSms: vi.fn(() => "New booking"),
  buildOwnerAppointmentStatusSms: mocks.buildOwnerAppointmentStatusSms,
  normalizeSmsPhone: vi.fn(() => "+639171234567"),
  sendTextbeeSms: mocks.sendTextbeeSms,
}));

describe("owner appointment SMS endpoint", () => {
  let handler: (req: any, res: any) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    vi.stubEnv("TEXTBEE_API_KEY", "textbee-key");
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner-1" } }, error: null });
    mocks.sendTextbeeSms.mockResolvedValue({ kind: "accepted", smsBatchId: "owner-batch-1" });
    mocks.buildOwnerAppointmentStatusSms.mockReturnValue("Appointment completed");

    let usersQuery = 0;
    const queryWithResult = (result: unknown) => {
      const query: any = {
        eq: vi.fn(() => query),
        maybeSingle: vi.fn().mockResolvedValue(result),
      };
      return query;
    };
    mocks.from.mockImplementation((table: string) => {
      if (table === "appointments") {
        return {
          select: vi.fn(() => queryWithResult({
            data: {
              id: "appointment-1",
              booking_id: "BK-1",
              customer_id: "customer-1",
              walk_in_name: null,
              service_type: "Oil change",
              scheduled_date: "2026-11-12",
              scheduled_time: "09:00",
              shop_id: "shop-1",
              status: "completed",
            },
            error: null,
          })),
        };
      }
      if (table === "shops") {
        return { select: vi.fn(() => queryWithResult({ data: { id: "shop-1", name: "MotoLink Garage", owner_id: "owner-1" }, error: null })) };
      }
      if (table === "users") {
        return {
          select: vi.fn(() => {
            usersQuery += 1;
            return queryWithResult(usersQuery === 1
              ? { data: { id: "owner-1", role: "owner" }, error: null }
              : { data: { id: "owner-1", phone: "09171234567" }, error: null });
          }),
        };
      }
      if (table === "owner_sms_deliveries") {
        return {
          select: vi.fn(() => queryWithResult({ data: null, error: null })),
          insert: vi.fn((row: unknown) => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: { id: "delivery-1", row }, error: null }),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    ({ default: handler } = await import("../../api/send-owner-appointment-sms"));
  });

  it("sends a status alert to the owning shop when the owner updates an appointment", async () => {
    const res = {
      status: vi.fn().mockImplementation(() => ({ json: (body: unknown) => body })),
    } as any;

    const result = await handler({
      method: "POST",
      body: { appointmentId: "appointment-1", status: "completed", accessToken: "token-1" },
    }, res);

    expect(result).toEqual({ success: true, queued: true, smsBatchId: "owner-batch-1" });
    expect(mocks.buildOwnerAppointmentStatusSms).toHaveBeenCalledWith({
      status: "completed",
      shopName: "MotoLink Garage",
      bookingRef: "BK-1",
      scheduledDate: "2026-11-12",
      scheduledTime: "09:00",
    });
    expect(mocks.sendTextbeeSms).toHaveBeenCalledWith(expect.objectContaining({
      recipient: "+639171234567",
      message: "Appointment completed",
    }));
  });
});
