import { describe, expect, it, vi } from "vitest";
import { buildAppointmentStatusSms, normalizeSmsPhone, sendTextbeeSms } from "./textbee";

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

  it("builds short, distinct messages for the allowed lifecycle statuses", () => {
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
    expect(buildAppointmentStatusSms({ ...base, status: "completed" })).not.toMatch(/[🏍️✅]/u);
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
