import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
}));

vi.mock("./supabaseClient", () => ({
  supabase: { auth: authMocks },
}));

import { postAuthenticatedJson } from "./authenticatedApi";

describe("postAuthenticatedJson", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it("refreshes the session and retries once after an API 401", async () => {
    authMocks.getSession.mockResolvedValue({ data: { session: { access_token: "expired-token" } } });
    authMocks.refreshSession.mockResolvedValue({ data: { session: { access_token: "fresh-token" } }, error: null });
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Session is invalid." }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await postAuthenticatedJson("/api/send-email", { appointmentId: "appointment-1" });

    expect(result.response?.status).toBe(200);
    expect(result.body).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).accessToken).toBe("expired-token");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).accessToken).toBe("fresh-token");
  });

  it("returns a sign-in prompt when no session or refresh token is available", async () => {
    authMocks.getSession.mockResolvedValue({ data: { session: null } });
    authMocks.refreshSession.mockResolvedValue({ data: { session: null }, error: new Error("No refresh token") });

    const result = await postAuthenticatedJson("/api/send-email", { appointmentId: "appointment-1" });

    expect(result.response).toBeNull();
    expect(result.error).toContain("Please sign in again");
  });
});
