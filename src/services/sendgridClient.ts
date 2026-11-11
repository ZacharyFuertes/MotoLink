/**
 * Email delivery client.
 *
 * The browser holds NO SendGrid credentials. It asks the Vercel Function
 * /api/send-email to render + deliver a whitelisted template for a given
 * appointment, and the function resolves all recipient/content server-side.
 */

import { postAuthenticatedJson } from "./authenticatedApi";

export type EmailTemplate =
  | "booking-request-received"
  | "booking-confirmation"
  | "service-in-progress"
  | "service-completion"
  | "booking-cancelled"
  | "booking-updated"
  | "booking-reschedule-requested"
  | "booking-rescheduled"
  | "booking-mechanic-reassigned"
  | "owner-booking";

export interface EmailRequestResult {
  success: boolean;
  skipped?: boolean;
  error?: string;
  /** True when the email service env keys aren't set yet callers should stay quiet. */
  notConfigured?: boolean;
}

/**
 * Request a transactional email for an appointment. Fire-and-forget friendly:
 * never throws failures are returned as { success: false, error } and the
 * caller decides whether to surface a toast.
 */
export const requestEmail = async (
  template: EmailTemplate,
  appointmentId: string,
): Promise<EmailRequestResult> => {
  try {
    const request = await postAuthenticatedJson("/api/send-email", { template, appointmentId });
    if (!request.response) return { success: false, error: request.error };
    const { response, body } = request;

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