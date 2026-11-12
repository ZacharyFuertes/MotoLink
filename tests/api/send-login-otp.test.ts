import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  signInWithPassword: vi.fn(),
  createTransport: vi.fn(),
  sendMail: vi.fn(),
  setApiKey: vi.fn(),
  sendgridSend: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn((_url: string, key: string) =>
    key === "service-role-key"
      ? { from: mocks.from }
      : { auth: { signInWithPassword: mocks.signInWithPassword } },
  ),
}));

vi.mock("nodemailer", () => ({
  default: { createTransport: mocks.createTransport },
}));

vi.mock("@sendgrid/mail", () => ({
  default: { setApiKey: mocks.setApiKey, send: mocks.sendgridSend },
}));

const makeResponse = () => ({
  statusCode: 0,
  body: null as any,
  status(statusCode: number) {
    this.statusCode = statusCode;
    return this;
  },
  json(body: unknown) {
    this.body = body;
    return this;
  },
});

describe("send login OTP endpoint admin switch", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    vi.stubEnv("SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("GMAIL_USER", "");
    vi.stubEnv("GMAIL_APP_PASS", "");
    vi.stubEnv("SENDGRID_API_KEY", "");
    vi.stubEnv("SENDGRID_FROM_EMAIL", "");

    mocks.from.mockImplementation((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn(() => ({
            ilike: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "user-1", email: "rider@example.com", name: "Rider", role: "customer" },
                error: null,
              }),
            })),
          })),
        };
      }
      if (table === "platform_settings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { setting_value: { value: false } },
                error: null,
              }),
            })),
          })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    mocks.signInWithPassword.mockResolvedValue({
      data: {
        user: { id: "user-1" },
        session: {
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_at: 123456,
        },
      },
      error: null,
    });
  });

  it("returns a password-authenticated session without sending OTP when disabled", async () => {
    const { default: handler } = await import("../../api/send-login-otp");
    const req = {
      method: "POST",
      body: { email: "rider@example.com", password: "correct-password" },
    };
    const res = makeResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      otpRequired: false,
      session: {
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_at: 123456,
      },
      user: { id: "user-1", email: "rider@example.com", role: "customer" },
    });
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "rider@example.com",
      password: "correct-password",
    });
    expect(mocks.createTransport).not.toHaveBeenCalled();
    expect(mocks.sendgridSend).not.toHaveBeenCalled();
  });

  it("does not send an OTP to a pending login when the switch is disabled", async () => {
    const { default: handler } = await import("../../api/send-login-otp");
    const req = { method: "POST", body: { email: "rider@example.com" } };
    const res = makeResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ success: false, otpDisabled: true });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
    expect(mocks.createTransport).not.toHaveBeenCalled();
    expect(mocks.sendgridSend).not.toHaveBeenCalled();
  });
});
