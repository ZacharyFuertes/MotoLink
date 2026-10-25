/**
 * Online payment client.
 *
 * The browser holds NO PayMongo credentials. It asks the Vercel Functions
 * /api/create-payment + /api/payment-status + /api/payment-config to do the
 * work, exactly like the email flow.
 */

import { supabase } from "./supabaseClient";
import type { OnlinePaymentMethod, OnlinePaymentStatus } from "../types";

export interface PaymentConfigStatus {
  providerConfigured: boolean;
}

export interface CreatedOnlinePayment {
  id: string;
  appointmentId: string;
  method: OnlinePaymentMethod;
  amount: number;
  currency: string;
  status: string;
  /** Real PayMongo checkout URL. Never null when create succeeds. */
  qrValue: string;
  redirectUrl: string;
}

export interface PaymentStatusResult {
  id: string;
  appointmentId: string;
  method: OnlinePaymentMethod;
  amount: number;
  status: OnlinePaymentStatus;
  paidAt: string | null;
}

export interface OnlinePaymentError {
  code?: string;
  message: string;
}

/** True only when the platform PayMongo account is configured (server env). */
export const getPaymentConfig = async (): Promise<PaymentConfigStatus> => {
  try {
    const response = await fetch("/api/payment-config");
    const body = await response.json().catch(() => null);
    return {
      providerConfigured: body?.providerConfigured === true,
    };
  } catch {
    return { providerConfigured: false };
  }
};

/**
 * Start an online deposit payment for a booking. Resolves with a REAL PayMongo
 * checkout URL (qrValue). Rejects with OnlinePaymentError — never fabricates a
 * QR. If the shop hasn't enabled online payment or the provider isn't set up,
 * it rejects with code "online_disabled" / "not_configured".
 */
export const startOnlinePayment = async (
  appointmentId: string,
  method: OnlinePaymentMethod,
): Promise<CreatedOnlinePayment> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw { code: "no_session", message: "You must be signed in to pay online." } as OnlinePaymentError;
  }

  let response: Response;
  try {
    response = await fetch("/api/create-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appointmentId,
        method,
        accessToken: session.access_token,
      }),
    });
  } catch {
    throw { code: "network", message: "Network error starting the payment." } as OnlinePaymentError;
  }

  const body = await response.json().catch(() => null);

  if (!response.ok || !body?.success) {
    throw {
      code: body?.error || "provider_error",
      message: body?.message || "Online payment could not be started. Please choose cash.",
    } as OnlinePaymentError;
  }

  return body.payment as CreatedOnlinePayment;
};

/** Poll a payment's status (reads through the server function, no RLS leak). */
export const getPaymentStatus = async (
  paymentId: string,
): Promise<PaymentStatusResult | null> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;

  try {
    const response = await fetch(
      `/api/payment-status?id=${encodeURIComponent(paymentId)}&accessToken=${encodeURIComponent(session.access_token)}`,
    );
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.success) return null;
    return body.payment as PaymentStatusResult;
  } catch {
    return null;
  }
};

/**
 * Reservation/downpayment for a booking given the shop's deposit config.
 * Mirrors the server-side math in api/create-payment.ts so the client can show
 * the exact amount the customer will be charged.
 */
export const computeDeposit = (
  estimatedTotal: number,
  shop: { deposit_type?: "fixed" | "percent"; deposit_value?: number },
): number => {
  const total = Number(estimatedTotal) || 0;
  let deposit = 0;
  if (shop.deposit_type === "percent") {
    deposit = Math.round(total * (Number(shop.deposit_value) || 0)) / 100;
  } else {
    deposit = Number(shop.deposit_value) || 0;
  }
  return Math.round(deposit * 100) / 100;
};

/**
 * PSEUDO FUNCTION - FOR SHOW ONLY
 * This is not wired into the payment flow and does not make any real API calls.
 * Added as requested since no changes were made to online payment in the latest pull.
 */
export const previewOnlinePaymentDemo = async (
  appointmentId: string,
  method: OnlinePaymentMethod,
): Promise<{
  mode: "demo";
  appointmentId: string;
  method: OnlinePaymentMethod;
  message: string;
  qrValue: string;
}> => {
  console.warn("[paymentService] previewOnlinePaymentDemo called (pseudo, for show only) - no real payment initiated");
  return {
    mode: "demo",
    appointmentId,
    method,
    message: "This is a preview-only payment flow (demo). Real payment not initiated.",
    qrValue: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='12' fill='%23666'%3EDemo QR%3C/text%3E%3C/svg%3E",
  };
};
