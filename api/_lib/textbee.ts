export type AppointmentSmsStatus = "confirmed" | "in_progress" | "completed" | "cancelled" | "rescheduled";

export type TextbeeSendResult =
  | { kind: "accepted"; smsBatchId: string | null; warning?: string }
  | { kind: "failed"; reason: string }
  | { kind: "unknown"; reason: string };

export interface AppointmentSmsContext {
  status: AppointmentSmsStatus;
  customerName?: string | null;
  shopName?: string | null;
  bookingRef?: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
}

export const buildOwnerAppointmentSms = (context: {
  shopName?: string | null;
  customerName?: string | null;
  serviceType?: string | null;
  bookingRef?: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
}): string => {
  const shop = cleanSmsText(context.shopName || "your shop", 40);
  const customer = cleanSmsText(context.customerName || "A customer", 32);
  const service = cleanSmsText(context.serviceType || "a service", 48);
  const reference = cleanSmsText(context.bookingRef || "", 24);
  const schedule = [context.scheduledDate, context.scheduledTime]
    .filter(Boolean)
    .map((value) => cleanSmsText(String(value), 20))
    .join(" ");
  return `MotoLink: New appointment at ${shop}. ${customer} booked ${service}${schedule ? ` for ${schedule}` : ""}.${reference ? ` Ref: ${reference}.` : ""}`;
};

export const buildOwnerLowStockSms = (context: {
  shopName?: string | null;
  partName: string;
  quantity: number;
  reorderLevel: number;
}): string => {
  const shop = cleanSmsText(context.shopName || "your shop", 40);
  const part = cleanSmsText(context.partName, 48);
  return context.quantity <= 0
    ? `MotoLink: ${part} is out of stock at ${shop}. Please restock.`
    : `MotoLink: Low stock at ${shop}: ${part} has ${context.quantity} left (reorder at ${context.reorderLevel}).`;
};

const cleanSmsText = (value: string, maxLength: number): string =>
  value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);

/** Normalize Philippine local mobile numbers, or validate an already international E.164 number. */
export const normalizeSmsPhone = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed || /[^\d+\s().-]/.test(trimmed)) return null;

  let compact = trimmed.replace(/[\s().-]/g, "");
  if (compact.startsWith("00")) compact = `+${compact.slice(2)}`;
  if (/^09\d{9}$/.test(compact)) compact = `+63${compact.slice(1)}`;
  else if (/^9\d{9}$/.test(compact)) compact = `+63${compact}`;
  else if (/^639\d{9}$/.test(compact)) compact = `+${compact}`;

  if (compact.startsWith("+63") && !/^\+639\d{9}$/.test(compact)) return null;
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null;
};

export const buildAppointmentStatusSms = (context: AppointmentSmsContext): string => {
  const customer = cleanSmsText(context.customerName || "", 32);
  const greeting = customer ? `Hi ${customer},` : "Hello,";
  const shop = cleanSmsText(context.shopName || "your shop", 40);
  const reference = cleanSmsText(context.bookingRef || "your booking", 24);

  if (context.status === "cancelled") {
    return `${greeting} your MotoLink booking ${reference} at ${shop} has been cancelled.`;
  }
  if (context.status === "rescheduled") {
    const date = cleanSmsText(context.scheduledDate || "", 16);
    const time = cleanSmsText(context.scheduledTime || "", 12);
    const schedule = [date, time].filter(Boolean).join(" ");
    return `${greeting} your MotoLink booking ${reference} at ${shop} has been rescheduled${schedule ? ` to ${schedule}` : ""}.`;
  }
  if (context.status === "confirmed") {
    const date = cleanSmsText(context.scheduledDate || "", 16);
    const time = cleanSmsText(context.scheduledTime || "", 12);
    const schedule = [date, time].filter(Boolean).join(" ");
    return `${greeting} your MotoLink booking ${reference} at ${shop} is confirmed${schedule ? ` for ${schedule}` : ""}.`;
  }
  if (context.status === "in_progress") {
    return `${greeting} work on your MotoLink booking ${reference} at ${shop} is now in progress.`;
  }
  return `${greeting} service for MotoLink booking ${reference} at ${shop} is complete and ready for pickup.`;
};

export const isSmsDeliveryLogUnavailable = (error: any): boolean => {
  const message = typeof error?.message === "string" ? error.message : "";
  const code = typeof error?.code === "string" ? error.code : "";

  return (
    code === "42P01" ||
    code === "42703" ||
    /relation .*appointment_sms_deliveries.* does not exist/i.test(message) ||
    /column .* does not exist/i.test(message) ||
    /permission denied.*appointment_sms_deliveries/i.test(message)
  );
};

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export const sendTextbeeSms = async (options: {
  apiKey: string;
  deviceId?: string;
  recipient: string;
  message: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  retryDelayMs?: number;
}): Promise<TextbeeSendResult> => {
  const fetcher = options.fetcher || fetch;
  const endpoint = "https://api.textbee.dev/api/v1/gateway/send-sms";
  const body = {
    recipients: [options.recipient],
    message: options.message,
    ...(options.deviceId ? { deviceId: options.deviceId } : {}),
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
    let response: Response;
    try {
      response = await fetcher(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": options.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeoutId);
      // A timeout/network interruption is ambiguous: Textbee may have accepted
      // the request, so never retry automatically.
      return {
        kind: "unknown",
        reason: error instanceof Error && error.name === "AbortError" ? "request_timeout" : "network_error",
      };
    }
    clearTimeout(timeoutId);

    const payload = await response.json().catch(() => null) as any;
    if (response.status === 429 && attempt === 0) {
      await wait(options.retryDelayMs ?? 2_000);
      continue;
    }
    if (!response.ok) {
      return {
        kind: response.status >= 500 ? "unknown" : "failed",
        reason: response.status === 429 ? "rate_limited" : `textbee_http_${response.status}`,
      };
    }

    const result = payload?.data ?? payload;
    if (result?.success === false || (Number(result?.failureCount) > 0 && Number(result?.successCount || 0) === 0)) {
      return { kind: "failed", reason: "textbee_rejected_message" };
    }
    return {
      kind: "accepted",
      smsBatchId: typeof result?.smsBatchId === "string" ? result.smsBatchId : null,
      ...(typeof result?.warning?.code === "string" ? { warning: result.warning.code } : {}),
    };
  }

  return { kind: "failed", reason: "rate_limited" };
};
