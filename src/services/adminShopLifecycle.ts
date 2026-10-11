/**
 * Admin-side wrappers around the shop lifecycle SECURITY DEFINER RPCs
 * (supabase/migrations/20261012_shop_soft_delete_status.sql).
 *
 * Only these functions may change the lifecycle fields; direct UPDATEs are
 * rejected by the guard trigger unless the caller is a platform admin AND
 * these RPCs are used.
 */

import { supabase } from "./supabaseClient";
import type { HoldReason } from "../lib/shopLifecycle";

export interface LifecycleResult {
  shop_id?: string;
  old_status?: string;
  new_status?: string;
  purge_scheduled_at?: string | null;
  legal_hold?: boolean;
}

const rpc = async (fn: string, args: Record<string, unknown>): Promise<LifecycleResult> => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    const e = error as { message?: string };
    throw new Error(e?.message || `Failed to run ${fn}.`);
  }
  return (data as LifecycleResult) || {};
};

/** PENDING → ACTIVE. */
export const approveShop = (shopId: string): Promise<LifecycleResult> =>
  rpc("admin_approve_shop", { p_shop_id: shopId });

/** ACTIVE/PENDING → ON_HOLD. reason: TERMINATED (subscription default) | ARCHIVED. */
export const holdShop = (
  shopId: string,
  reason: HoldReason,
  note?: string,
): Promise<LifecycleResult> =>
  rpc("admin_hold_shop", { p_shop_id: shopId, p_reason: reason, p_note: note || null });

/** ON_HOLD → ACTIVE. */
export const reactivateShop = (shopId: string, note?: string): Promise<LifecycleResult> =>
  rpc("admin_reactivate_shop", { p_shop_id: shopId, p_note: note || null });

/** ON_HOLD only — push purge_scheduled_at further out by N days. */
export const extendRetention = (
  shopId: string,
  days: number,
  reason: string,
): Promise<LifecycleResult> =>
  rpc("admin_extend_retention", { p_shop_id: shopId, p_days: days, p_reason: reason });

/** ON_HOLD only — raise (active=true, reason required) or lift a legal hold. */
export const toggleLegalHold = (
  shopId: string,
  active: boolean,
  reason?: string,
): Promise<LifecycleResult> =>
  rpc("admin_toggle_legal_hold", {
    p_shop_id: shopId,
    p_active: active,
    p_reason: reason || null,
  });

/** Admin-only listing of ON_HOLD shops with days remaining before purge. */
export const listOnHoldShops = async (): Promise<
  Array<{
    id?: string;
    name?: string;
    status?: string;
    hold_reason?: string | null;
    on_hold_at?: string | null;
    purge_scheduled_at?: string | null;
    days_remaining?: number;
    legal_hold?: boolean;
    owner_email?: string | null;
  }>
> => {
  const { data, error } = await supabase.rpc("list_on_hold_shops");
  if (error) {
    const e = error as { message?: string };
    throw new Error(e?.message || "Failed to list on-hold shops.");
  }
  return (data as Array<Record<string, unknown>>) || ([] as Array<Record<string, unknown>>);
};

export const lifecycleError = (error: unknown): string => {
  const e = error as { message?: string };
  const message = (e?.message || String(error) || "Unknown error").toLowerCase();
  if (message.includes("only a platform admin")) {
    return "Only a platform admin can change shop status.";
  }
  if (message.includes("invalid shop status transition")) {
    return "That status change is not allowed for this shop right now.";
  }
  if (message.includes("on-hold") || message.includes("on hold")) {
    return "Only ON_HOLD shops can use this action.";
  }
  if (message.includes("legal hold")) {
    return "This shop is under a legal hold — purge or status changes are blocked.";
  }
  if (message.includes("missing column") || message.includes("42703")) {
    return "The shop lifecycle migration has not been applied to the database yet.";
  }
  return e?.message || "Operation failed. Please try again.";
};