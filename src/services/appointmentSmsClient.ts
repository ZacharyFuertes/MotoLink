import { postAuthenticatedJson } from "./authenticatedApi";

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
  try {
    const request = await postAuthenticatedJson("/api/send-appointment-sms", { appointmentId, status });
    if (!request.response) return { success: false, error: request.error };
    const { response, body } = request;
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