import { supabase } from "./supabaseClient";
import { Appointment, JobOrder, JobOrderPart } from "../types";

/**
 * Job Order Service
 * Handles job order creation from appointments and mechanic labor logging.
 */

export const jobOrderService = {
  /**
   * Find the job order linked to an appointment, if any.
   */
  async getJobOrderForAppointment(appointmentId: string): Promise<JobOrder | null> {
    const { data, error } = await supabase
      .from("job_orders")
      .select("*")
      .eq("appointment_id", appointmentId)
      .maybeSingle();

    if (error || !data) return null;
    return data as JobOrder;
  },

  /**
   * Create a job order from an appointment (idempotent).
   */
  async ensureJobOrderForAppointment(appointment: Appointment): Promise<JobOrder | null> {
    const existing = await this.getJobOrderForAppointment(appointment.id);
    if (existing) return existing;

    const { data, error } = await supabase
      .from("job_orders")
      .insert([
        {
          shop_id: appointment.shop_id,
          appointment_id: appointment.id,
          customer_id: appointment.customer_id,
          mechanic_id: appointment.mechanic_id || null,
          status: "pending",
          parts_used: [],
          labor_hours: null,
          labor_rate: null,
          total_cost: 0,
          notes: appointment.description || null,
        },
      ])
      .select()
      .single();

    if (error || !data) {
      console.error("Error creating job order:", error);
      return null;
    }
    return data as JobOrder;
  },

  /**
   * Log mechanic labor hours + rate onto the job order and recompute total cost.
   */
  async logLabor(
    jobOrderId: string,
    laborHours: number,
    laborRate: number,
  ): Promise<boolean> {
    const jobOrder = await this.getJobOrderById(jobOrderId);
    if (!jobOrder) return false;

    const partsCost =
      (jobOrder.parts_used || []).reduce(
        (sum, p) => sum + (p.quantity_used || 0) * (p.unit_price || 0),
        0,
      ) || 0;
    const totalCost = Math.round((partsCost + laborHours * laborRate) * 100) / 100;

    const { error } = await supabase
      .from("job_orders")
      .update({
        labor_hours: laborHours,
        labor_rate: laborRate,
        total_cost: totalCost,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobOrderId);

    if (error) {
      console.error("Error logging labor:", error);
      return false;
    }
    return true;
  },

  /**
   * Add a part to the job order's parts_used list.
   */
  async addPartUsed(
    jobOrderId: string,
    part: { part_id: string; quantity_used: number; unit_price: number },
  ): Promise<boolean> {
    const jobOrder = await this.getJobOrderById(jobOrderId);
    if (!jobOrder) return false;

    const partsUsed: JobOrderPart[] = jobOrder.parts_used || [];
    const existing = partsUsed.find((p) => p.part_id === part.part_id);

    let nextParts: JobOrderPart[];
    if (existing) {
      nextParts = partsUsed.map((p) =>
        p.part_id === part.part_id
          ? { ...p, quantity_used: p.quantity_used + part.quantity_used }
          : p,
      );
    } else {
      nextParts = [...partsUsed, part];
    }

    const partsCost = nextParts.reduce(
      (sum, p) => sum + (p.quantity_used || 0) * (p.unit_price || 0),
      0,
    );
    const laborCost =
      (jobOrder.labor_hours || 0) * (jobOrder.labor_rate || 0);
    const totalCost = Math.round((partsCost + laborCost) * 100) / 100;

    const { error } = await supabase
      .from("job_orders")
      .update({
        parts_used: nextParts,
        total_cost: totalCost,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobOrderId);

    if (error) {
      console.error("Error adding part to job order:", error);
      return false;
    }
    return true;
  },

  /**
   * Complete a job order: mark completed, deduct stock, set completed_at.
   * Returns the part line items resolved for display/email purposes.
   */
  async completeJobOrder(
    jobOrderId: string,
  ): Promise<{ success: boolean; resolvedParts: { name: string; quantity: number; unit_price: number }[] }> {
    const jobOrder = await this.getJobOrderById(jobOrderId);
    if (!jobOrder) return { success: false, resolvedParts: [] };

    const parts = jobOrder.parts_used || [];
    const resolvedParts: { name: string; quantity: number; unit_price: number }[] = [];

    for (const part of parts) {
      const { data: partData } = await supabase
        .from("parts")
        .select("name, quantity_in_stock, unit_price")
        .eq("id", part.part_id)
        .single();

      if (partData) {
        const newQty = Math.max(0, partData.quantity_in_stock - part.quantity_used);
        await supabase
          .from("parts")
          .update({
            quantity_in_stock: newQty,
            updated_at: new Date().toISOString(),
          })
          .eq("id", part.part_id);

        resolvedParts.push({
          name: partData.name,
          quantity: part.quantity_used,
          unit_price: partData.unit_price,
        });
      }
    }

    const { error } = await supabase
      .from("job_orders")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobOrderId);

    if (error) {
      console.error("Error completing job order:", error);
      return { success: false, resolvedParts };
    }
    return { success: true, resolvedParts };
  },

  /**
   * Fetch a job order by id.
   */
  async getJobOrderById(jobOrderId: string): Promise<JobOrder | null> {
    const { data, error } = await supabase
      .from("job_orders")
      .select("*")
      .eq("id", jobOrderId)
      .single();

    if (error || !data) return null;
    return data as JobOrder;
  },
};
