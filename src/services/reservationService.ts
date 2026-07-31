import { supabase } from "./supabaseClient";

export type ReservationStatus =
  | "pending"
  | "confirmed"
  | "fulfilled"
  | "cancelled";

export interface Reservation {
  id: string;
  customer_id: string;
  part_id: string;
  shop_id?: string | null;
  status: ReservationStatus;
  quantity: number;
  created_at: string;
  updated_at: string;
  parts?: {
    id: string;
    name: string;
    unit_price: number;
    quantity_in_stock: number;
    shop_id: string;
  } | null;
  customer?: {
    id: string;
    name: string;
    email: string;
    phone?: string;
  } | null;
}

/**
 * Reservation Service
 * Handles part reservation create/fulfill flows.
 */

export const reservationService = {
  /**
   * Create a reservation for a part (customers only).
   * shopId is the part's shop — stored on the reservation so owners can
   * query their own shop's reservations directly (instead of a parts join).
   */
  async createReservation(
    customerId: string,
    partId: string,
    quantity: number,
    shopId?: string | null,
  ): Promise<Reservation | null> {
    const { data, error } = await supabase
      .from("reservations")
      .insert([
        {
          customer_id: customerId,
          part_id: partId,
          quantity,
          status: "pending",
          shop_id: shopId || null,
        },
      ])
      .select()
      .single();

    if (error || !data) {
      console.error("Error creating reservation:", error);
      return null;
    }
    return data as Reservation;
  },

  /**
   * Fetch a customer's own reservations with part details.
   */
  async getMyReservations(customerId: string): Promise<Reservation[]> {
    const { data, error } = await supabase
      .from("reservations")
      .select("*, parts(id, name, unit_price, quantity_in_stock, shop_id)")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (error || !data) return [];
    return data as Reservation[];
  },

  /**
   * Fetch reservations for a shop (owner/admin view).
   * Scoped by reservations.shop_id — the shop column added in the
   * 20260731_owner_data_isolation migration.
   */
  async getShopReservations(shopId: string): Promise<Reservation[]> {
    const { data, error } = await supabase
      .from("reservations")
      .select(
        "*, parts(id, name, unit_price, quantity_in_stock, shop_id), customer:users(id, name, email, phone)",
      )
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false });

    if (error || !data) return [];
    return data as Reservation[];
  },

  /**
   * Update a reservation status.
   */
  async updateStatus(
    reservationId: string,
    status: ReservationStatus,
  ): Promise<boolean> {
    const { error } = await supabase
      .from("reservations")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", reservationId);

    if (error) {
      console.error("Error updating reservation:", error);
      return false;
    }
    return true;
  },

  /**
   * Fulfill a reservation: set status fulfilled and deduct stock.
   */
  async fulfillReservation(reservation: Reservation): Promise<boolean> {
    const part = reservation.parts;
    if (!part) return false;
    if (part.quantity_in_stock < reservation.quantity) return false;

    const newQty = Math.max(
      0,
      part.quantity_in_stock - reservation.quantity,
    );

    const { error: stockError } = await supabase
      .from("parts")
      .update({
        quantity_in_stock: newQty,
        updated_at: new Date().toISOString(),
      })
      .eq("id", part.id);
    if (stockError) {
      console.error("Error deducting stock for reservation:", stockError);
      return false;
    }

    return this.updateStatus(reservation.id, "fulfilled");
  },
};
