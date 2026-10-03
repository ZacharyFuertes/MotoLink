import { supabase } from "./supabaseClient";
import { Appointment, JobOrder } from "../types";

/**
 * Job Order Service
 * Creates the job order tied to an appointment. The owner finalizes the job
 * order and generates the invoice from the appointment's confirmed status.
 */

export const jobOrderService = {
  /**
   * Find the job order linked to an appointment, if any.
   */
  async getJobOrderForAppointment(
    appointmentId: string,
  ): Promise<JobOrder | null> {
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
  async ensureJobOrderForAppointment(
    appointment: Appointment,
  ): Promise<JobOrder | null> {
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
};