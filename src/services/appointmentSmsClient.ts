import { supabase } from "./supabaseClient";

export type AppointmentSmsStatus = "confirmed" | "in_progress" | "completed";

export interface AppointmentSmsResult {
  success: boolean;
  queued?: boolean;
  skipped?: boolean;
  duplicate?: boolean;
  notConfigured?: boolean;
  uncertain?: boolean;
  error?: string;
  reason?: string;
  smsBatchId?: string | null;
  warning?: string;
}

export const requestAppointmentStatusSms = async (
  appointmentId: string,
  status: AppointmentSmsStatus,
): Promise<AppointmentSmsResult> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { success: false, error: "Not signed in." };

  try {
    const response = await fetch("/api/send-appointment-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId, status, accessToken: session.access_token }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const error = typeof body?.error === "string" ? body.error : `SMS request failed (${response.status}).`;
      return {
        success: false,
        error,
        ...(body?.notConfigured || /not configured/i.test(error) ? { notConfigured: true } : {}),
      };
    }
    return body && typeof body.success === "boolean"
      ? body as AppointmentSmsResult
      : { success: false, error: "SMS service returned an invalid response." };
  } catch (error) {
    console.error("Network error requesting appointment SMS:", error);
    return { success: false, error: "Network error requesting SMS." };
  }
};