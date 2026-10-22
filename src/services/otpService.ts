/**
 * Client-side helpers for the email OTP login flow.
 *
 * The browser never talks to Gmail directly — it calls the serverless
 * endpoints in `api/` which own the SMTP credentials.
 */

export interface OtpSendResult {
  success: boolean;
  message?: string;
  error?: string;
}

export interface OtpVerifyResult {
  success: boolean;
  error?: string;
  session?: {
    access_token: string;
    refresh_token: string;
    expires_at?: number;
  };
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

const post = async (path: string, body: Record<string, unknown>) => {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  let payload: any = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  return { status: response.status, payload };
};

/** Ask the server to email a fresh verification code. */
export const requestLoginCode = async (
  email: string,
  password?: string,
): Promise<OtpSendResult> => {
  try {
    const { status, payload } = await post("/api/send-login-otp", { email, password });

    if (!responseOk(status, payload)) {
      return {
        success: false,
        error: payload?.error || "Could not send the verification code.",
      };
    }

    return {
      success: true,
      message: payload?.message || "Verification code sent to your email.",
    };
  } catch {
    return {
      success: false,
      error: "Network error. Please check your connection and try again.",
    };
  }
};

/** Verify the emailed code and receive a Supabase session. */
export const verifyLoginCode = async (
  email: string,
  code: string,
): Promise<OtpVerifyResult> => {
  try {
    const { status, payload } = await post("/api/verify-login-otp", { email, code });

    if (!responseOk(status, payload)) {
      return {
        success: false,
        error: payload?.error || "The code is invalid or has expired.",
      };
    }

    if (!payload?.session?.access_token) {
      return { success: false, error: "Could not create a session." };
    }

    return {
      success: true,
      session: payload.session,
      user: payload.user,
    };
  } catch {
    return {
      success: false,
      error: "Network error. Please check your connection and try again.",
    };
  }
};

const responseOk = (status: number, payload: any): boolean =>
  status >= 200 && status < 300 && payload?.success === true;
