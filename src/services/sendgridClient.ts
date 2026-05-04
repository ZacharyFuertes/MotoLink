/**
 * SendGrid API Client Wrapper
 * Handles all email delivery via SendGrid's v3 API.
 * Uses fetch() directly to avoid needing a Node.js-only SDK in the browser.
 */

// @ts-ignore - Vite environment variables
const SENDGRID_API_KEY = import.meta.env.VITE_SENDGRID_API_KEY as string;
// @ts-ignore - Vite environment variables
const FROM_EMAIL = import.meta.env.VITE_SENDGRID_FROM_EMAIL as string;
const FROM_NAME = "MotoShop AutoCare";

export interface EmailPayload {
  to: string;
  toName?: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
}

export interface SendGridResponse {
  success: boolean;
  statusCode?: number;
  error?: string;
}

/**
 * Send a transactional email via SendGrid v3 REST API.
 * Returns { success, statusCode, error }.
 */
export const sendEmail = async (
  payload: EmailPayload
): Promise<SendGridResponse> => {
  if (!SENDGRID_API_KEY) {
    console.warn("⚠️  VITE_SENDGRID_API_KEY not set – email NOT sent.");
    return { success: false, error: "SENDGRID_API_KEY is not configured." };
  }

  if (!FROM_EMAIL) {
    console.warn("⚠️  VITE_SENDGRID_FROM_EMAIL not set – email NOT sent.");
    return { success: false, error: "SENDGRID_FROM_EMAIL is not configured." };
  }

  const body = {
    personalizations: [
      {
        to: [{ email: payload.to, name: payload.toName || payload.to }],
        subject: payload.subject,
      },
    ],
    from: { email: FROM_EMAIL, name: FROM_NAME },
    content: [
      ...(payload.textContent
        ? [{ type: "text/plain", value: payload.textContent }]
        : []),
      {
        type: "text/html",
        value: payload.htmlContent,
      },
    ],
  };

  try {
    const response = await fetch("/api/sendgrid/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.status === 202) {
      console.log(`✅ Email sent to ${payload.to} (${payload.subject})`);
      return { success: true, statusCode: 202 };
    }

    // SendGrid error body is JSON on non-202
    let errorBody: any = {};
    try {
      errorBody = await response.json();
    } catch (_) {
      /* ignore parse failure */
    }

    const errorMsg =
      errorBody?.errors?.[0]?.message ||
      `SendGrid returned ${response.status}`;
    console.error("❌ SendGrid error:", errorMsg, errorBody);
    return { success: false, statusCode: response.status, error: errorMsg };
  } catch (err: any) {
    console.error("❌ Network error sending email:", err);
    return {
      success: false,
      error: err?.message || "Network error while sending email",
    };
  }
};
