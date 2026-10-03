/**
 * Email delivery client.
 *
 * The browser holds NO SendGrid credentials. It asks the Vercel Function
 * /api/send-email to render + deliver a whitelisted template for a given
 * appointment, and the function resolves all recipient/content server-side.
 */

import { supabase } from "./supabaseClient";

export type EmailTemplate =
  | "booking-confirmation"
  | "service-completion"
  | "booking-cancelled"
  | "booking-updated"
  | "owner-booking";

export interface EmailRequestResult {
  success: boolean;
  skipped?: boolean;
  error?: string;
  /** True when the email service env keys aren't set yet — callers should stay quiet. */
  notConfigured?: boolean;
}

/**
 * Request a transactional email for an appointment. Fire-and-forget friendly:
 * never throws — failures are returned as { success: false, error } and the
 * caller decides whether to surface a toast.
 */
export const requestEmail = async (
  template: EmailTemplate,
  appointmentId: string,
): Promise<EmailRequestResult> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { success: false, error: "Not signed in." };
  }

  try {
    const response = await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template,
        appointmentId,
        accessToken: session.access_token,
      }),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      const notConfigured =
        typeof body?.error === "string" && /not configured/i.test(body.error);
      return {
        success: false,
        error: body?.error || `Email request failed (${response.status}).`,
        ...(notConfigured ? { notConfigured: true } : {}),
      };
    }

    if (body && typeof body.success === "boolean") {
      return body as EmailRequestResult;
    }

    return { success: true };
  } catch (err: any) {
    console.error("Network error requesting email:", err);
    return {
      success: false,
      error: "Network error sending email.",
    };
  }
};