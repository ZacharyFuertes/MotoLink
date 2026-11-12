import { describe, expect, it, vi } from "vitest";
import { buildAppointmentStatusSms, buildOwnerAppointmentSms, buildOwnerAppointmentStatusSms, buildOwnerLowStockSms, isSmsDeliveryLogUnavailable, isSmsEventKeyUnavailable, normalizeSmsPhone, sendTextbeeSms } from "../../server/textbee";

const jsonResponse = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

describe("Textbee appointment SMS helpers", () => {
  it.each([
    ["0917 123 4567", "+639171234567"],
    ["917-123-4567", "+639171234567"],
    ["639171234567", "+639171234567"],
    ["+639171234567", "+639171234567"],
    ["+12025550123", "+12025550123"],
    ["+6309171234567", null],
    ["+63281234567", null],
    ["0917ABC4567", null],
    ["123", null],
  ])("normalizes phone %s", (input, expected) => {
    expect(normalizeSmsPhone(input)).toBe(expected);
  });

  it("builds short, distinct messages for appointment lifecycle events", () => {
    const base = {
      customerName: "Mina",
      shopName: "MotoLink Garage",
      bookingRef: "MTL-123",
      scheduledDate: "2026-11-12",
      scheduledTime: "09:00",
    };
    expect(buildAppointmentStatusSms({ ...base, status: "confirmed" })).toContain("is confirmed for 2026-11-12 09:00");
    expect(buildAppointmentStatusSms({ ...base, status: "in_progress" })).toContain("now in progress");
    expect(buildAppointmentStatusSms({ ...base, status: "completed" })).toContain("ready for pickup");
    expect(buildAppointmentStatusSms({ ...base, status: "cancelled" })).toContain("has been cancelled");
    expect(buildAppointmentStatusSms({ ...base, status: "rescheduled" })).toContain("has been rescheduled to 2026-11-12 09:00");
    expect(buildAppointmentStatusSms({ ...base, status: "completed" })).not.toMatch(/[🏍️✅]/u);
  });

  it("builds owner alerts for new appointments and low stock", () => {
    expect(buildOwnerAppointmentSms({
      shopName: "MotoLink Garage",
      customerName: "Mina",
      serviceType: "Oil change",
      bookingRef: "MTL-123",
      scheduledDate: "2026-11-12",
      scheduledTime: "09:00",
    })).toContain("New appointment at MotoLink Garage. Mina booked Oil change for 2026-11-12 09:00. Ref: MTL-123.");
    expect(buildOwnerLowStockSms({ shopName: "MotoLink Garage", partName: "Brake Pads", quantity: 2, reorderLevel: 5 }))
      .toContain("Brake Pads has 2 left (reorder at 5)");
    expect(buildOwnerLowStockSms({ shopName: "MotoLink Garage", partName: "Brake Pads", quantity: 0, reorderLevel: 5 }))
      .toContain("Brake Pads is out of stock");
  });

  it("builds owner appointment status messages", () => {
    expect(buildOwnerAppointmentStatusSms({
      status: "completed",
      shopName: "MotoLink Garage",
      bookingRef: "MTL-123",
    })).toBe("MotoLink: Appointment MTL-123 at MotoLink Garage is completed and ready for pickup.");
    expect(buildOwnerAppointmentStatusSms({
      status: "rescheduled",
      shopName: "MotoLink Garage",
      bookingRef: "MTL-123",
      scheduledDate: "2026-11-12",
      scheduledTime: "09:00",
    })).toContain("is rescheduled to 2026-11-12 09:00.");
  });

  it("flags missing delivery-table schema as a non-fatal runtime issue", () => {
    expect(isSmsDeliveryLogUnavailable({ code: "42P01", message: 'relation "public.appointment_sms_deliveries" does not exist' })).toBe(true);
    expect(isSmsDeliveryLogUnavailable({ code: "42703", message: 'column "updated_at" of relation "appointment_sms_deliveries" does not exist' })).toBe(true);
    expect(isSmsDeliveryLogUnavailable({ message: "Textbee rejected the message", code: "400" })).toBe(false);
  });

  it("recognizes PostgREST schema-cache errors for the event-key migration", () => {
    expect(isSmsEventKeyUnavailable({
      code: "PGRST204",
      message: "Could not find the 'event_key' column of 'appointment_sms_deliveries' in the schema cache",
    })).toBe(true);
    expect(isSmsEventKeyUnavailable({ code: "42703", message: 'column "event_key" does not exist' })).toBe(true);
    expect(isSmsEventKeyUnavailable({ code: "PGRST204", message: "Could not find the 'state' column" })).toBe(false);
  });

  it("posts the documented payload and returns the queued Textbee batch ID", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, {
      data: { success: true, smsBatchId: "batch-123", recipientCount: 1 },
    }));
    const result = await sendTextbeeSms({
      apiKey: "server-test-key",
      deviceId: "device-123",
      recipient: "+639171234567",
      message: "Your booking is confirmed.",
      fetcher,
      timeoutMs: 100,
    });

    expect(result).toEqual({ kind: "accepted", smsBatchId: "batch-123" });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.textbee.dev/api/v1/gateway/send-sms");
    expect(new Headers(init?.headers).get("x-api-key")).toBe("server-test-key");
    expect(JSON.parse(String(init?.body))).toEqual({
      recipients: ["+639171234567"],
      message: "Your booking is confirmed.",
      deviceId: "device-123",
    });
  });

  it("does not report a 2xx response as queued without an explicit gateway acceptance", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, { data: {} }));
    const result = await sendTextbeeSms({
      apiKey: "server-test-key",
      recipient: "+639171234567",
      message: "Your booking is confirmed.",
      fetcher,
      timeoutMs: 100,
    });

    expect(result).toEqual({ kind: "unknown", reason: "textbee_unconfirmed_response" });
  });

  it("retries one explicit 429, but does not retry an uncertain timeout", async () => {
    const rateLimited = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(429, { message: "rate limited" }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { success: true, smsBatchId: "batch-after-429" } }));
    const retryResult = await sendTextbeeSms({
      apiKey: "key",
      recipient: "+639171234567",
      message: "Status update.",
      fetcher: rateLimited,
      timeoutMs: 100,
      retryDelayMs: 0,
    });
    expect(retryResult).toEqual({ kind: "accepted", smsBatchId: "batch-after-429" });
    expect(rateLimited).toHaveBeenCalledTimes(2);

    const timeout = Object.assign(new Error("aborted"), { name: "AbortError" });
    const uncertainFetcher = vi.fn<typeof fetch>().mockRejectedValue(timeout);
    const uncertainResult = await sendTextbeeSms({
      apiKey: "key",
      recipient: "+639171234567",
      message: "Status update.",
      fetcher: uncertainFetcher,
      timeoutMs: 100,
    });
    expect(uncertainResult).toEqual({ kind: "unknown", reason: "request_timeout" });
    expect(uncertainFetcher).toHaveBeenCalledOnce();
  });
});
