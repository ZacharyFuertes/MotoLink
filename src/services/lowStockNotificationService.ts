import { supabase } from "./supabaseClient";

export interface LowStockSnapshot {
  id: string;
  quantity_in_stock: number;
  reorder_level: number;
}

/**
 * Notify the shop owner only when a stock change crosses from above the
 * reorder threshold to at/below it. Delivery is best-effort and never blocks
 * inventory updates.
 */
export const notifyOwnerIfStockBecameLow = async (
  previous: LowStockSnapshot | null,
  next: LowStockSnapshot,
): Promise<void> => {
  const currentQuantity = Number(next.quantity_in_stock);
  const currentReorderLevel = Number(next.reorder_level);
  const wasCreatedLow =
    previous === null && currentQuantity <= currentReorderLevel;
  const crossedThreshold =
    previous !== null &&
    Number(previous.quantity_in_stock) > Number(previous.reorder_level) &&
    currentQuantity <= currentReorderLevel;
  const becameOutOfStock =
    previous !== null &&
    Number(previous.quantity_in_stock) > 0 &&
    currentQuantity <= 0;
  if (!wasCreatedLow && !crossedThreshold && !becameOutOfStock) return;

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    const response = await fetch("/api/send-low-stock-alert", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        partId: next.id,
        previousQuantity: previous?.quantity_in_stock ?? null,
        previousReorderLevel: previous?.reorder_level ?? null,
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.success !== true) {
      console.warn(
        "Could not send low-stock alert:",
        payload?.error || `Request failed (${response.status}).`,
      );
    }
  } catch (error) {
    console.warn("Low-stock alert request failed:", error);
  }
};
