/**
 * notificationService.test.ts
 * Unit tests for the notification service layer.
 *
 * ─── HOW TO RUN ──────────────────────────────────────────────────────────────
 * This project uses Vite. Install Vitest first:
 *
 *   npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom
 *
 * Then add to package.json scripts:
 *   "test": "vitest run"
 *   "test:ui": "vitest --ui"
 *
 * Run tests:
 *   npm test
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────────

// Mock SendGrid fetch so no real HTTP calls are made
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock Supabase client
vi.mock("../services/supabaseClient", () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }),
  },
}));

// Mock env vars
vi.stubEnv("VITE_SENDGRID_API_KEY", "SG.test_key_12345");
vi.stubEnv("VITE_SENDGRID_FROM_EMAIL", "test@example.com");

// ── Import after mocks ─────────────────────────────────────────────────────────
import { sendEmail } from "../services/sendgridClient";
import { sendServiceCompletionEmail } from "../services/notificationService";

// ── Helper data ────────────────────────────────────────────────────────────────
const mockAppointmentData = {
  appointmentId: "aaa-bbb-ccc-ddd",
  customerName: "Maria Santos",
  customerEmail: "maria@example.com",
  vehicleMake: "Toyota",
  vehicleModel: "Vios",
  vehicleYear: 2020,
  serviceType: "Oil Change",
  scheduledDate: "2026-05-04",
  partsUsed: [
    { name: "Engine Oil 5W-30", quantity: 4, unit_price: 250 },
    { name: "Oil Filter", quantity: 1, unit_price: 120 },
  ],
  totalAmount: 1120,
  laborCost: 500,
  completionNotes: "Replaced oil and filter. All good.",
};

// ── sendgridClient Tests ───────────────────────────────────────────────────────

describe("sendgridClient", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it("returns success when SendGrid responds with 202", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 202,
      json: async () => ({}),
    });

    const result = await sendEmail({
      to: "customer@example.com",
      toName: "Test Customer",
      subject: "Test Subject",
      htmlContent: "<p>Hello</p>",
    });

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(202);
  });

  it("returns failure when SendGrid responds with 403", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 403,
      json: async () => ({
        errors: [{ message: "Permission denied" }],
      }),
    });

    const result = await sendEmail({
      to: "customer@example.com",
      subject: "Test",
      htmlContent: "<p>Hello</p>",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Permission denied");
  });

  it("returns failure when API key is not set", async () => {
    vi.stubEnv("VITE_SENDGRID_API_KEY", "");

    const result = await sendEmail({
      to: "customer@example.com",
      subject: "Test",
      htmlContent: "<p>Hello</p>",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not configured");

    // Restore for subsequent tests
    vi.stubEnv("VITE_SENDGRID_API_KEY", "SG.test_key_12345");
  });

  it("handles network errors gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network timeout"));

    const result = await sendEmail({
      to: "customer@example.com",
      subject: "Test",
      htmlContent: "<p>Hello</p>",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Network timeout");
  });

  it("sends correct authorization header", async () => {
    mockFetch.mockResolvedValueOnce({ status: 202, json: async () => ({}) });

    await sendEmail({
      to: "x@x.com",
      subject: "S",
      htmlContent: "<p>H</p>",
    });

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers["Authorization"]).toBe("Bearer SG.test_key_12345");
  });
});

// ── notificationService Tests ─────────────────────────────────────────────────

describe("sendServiceCompletionEmail", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sends email and returns success when SendGrid accepts", async () => {
    mockFetch.mockResolvedValue({ status: 202, json: async () => ({}) });

    const result = await sendServiceCompletionEmail(mockAppointmentData);

    expect(result.success).toBe(true);
    expect(result.skipped).toBeUndefined();
  });

  it("skips send when customer has opted out", async () => {
    // Mock Supabase to return opted-out preference
    const { supabase } = await import("../services/supabaseClient");
    (supabase.from as any).mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValueOnce({
          data: { id: "user-1" },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { email_notifications_enabled: false },
          error: null,
        }),
    });

    const result = await sendServiceCompletionEmail(mockAppointmentData);

    // fetch should NOT have been called (email skipped)
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.skipped).toBe(true);
  });

  it("returns error without crashing when SendGrid fails", async () => {
    mockFetch.mockResolvedValue({
      status: 500,
      json: async () => ({ errors: [{ message: "Internal server error" }] }),
    });

    const result = await sendServiceCompletionEmail(mockAppointmentData);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("includes correct recipient in SendGrid payload", async () => {
    mockFetch.mockResolvedValue({ status: 202, json: async () => ({}) });

    await sendServiceCompletionEmail(mockAppointmentData);

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);

    expect(body.personalizations[0].to[0].email).toBe(
      mockAppointmentData.customerEmail
    );
  });

  it("includes vehicle and service info in email subject", async () => {
    mockFetch.mockResolvedValue({ status: 202, json: async () => ({}) });

    await sendServiceCompletionEmail(mockAppointmentData);

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    const subject: string = body.personalizations[0].subject;

    expect(subject).toContain("Oil Change");
  });
});

// ── Email template sanity checks ──────────────────────────────────────────────

describe("email HTML template", () => {
  it("contains customer name in HTML body", async () => {
    mockFetch.mockResolvedValue({ status: 202, json: async () => ({}) });

    await sendServiceCompletionEmail(mockAppointmentData);

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    const html: string = body.content.find(
      (c: { type: string }) => c.type === "text/html"
    )?.value;

    expect(html).toContain("Maria");
    expect(html).toContain("Toyota");
    expect(html).toContain("Vios");
    expect(html).toContain("Oil Change");
  });

  it("contains parts rows in HTML body", async () => {
    mockFetch.mockResolvedValue({ status: 202, json: async () => ({}) });

    await sendServiceCompletionEmail(mockAppointmentData);

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    const html: string = body.content.find(
      (c: { type: string }) => c.type === "text/html"
    )?.value;

    expect(html).toContain("Engine Oil 5W-30");
    expect(html).toContain("Oil Filter");
  });
});
