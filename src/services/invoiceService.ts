import { supabase } from "./supabaseClient";
import { Invoice, JobOrder } from "../types";

/**
 * Invoice Service
 * Handles invoice generation from completed job orders and customer views.
 */

export const invoiceService = {
  /**
   * Create an invoice for a completed job order (idempotent per job order).
   */
  async createInvoiceForJobOrder(jobOrder: JobOrder): Promise<Invoice | null> {
    const existing = await this.getInvoiceForJobOrder(jobOrder.id);
    if (existing) return existing;

    const totalAmount =
      Math.round((jobOrder.total_cost || 0) * 100) / 100;

    const { data, error } = await supabase
      .from("invoices")
      .insert([
        {
          job_order_id: jobOrder.id,
          customer_id: jobOrder.customer_id,
          total_amount: totalAmount,
          payment_status: "unpaid",
        },
      ])
      .select()
      .single();

    if (error || !data) {
      console.error("Error creating invoice:", error);
      return null;
    }
    return data as Invoice;
  },

  /**
   * Find the invoice for a job order, if any.
   */
  async getInvoiceForJobOrder(jobOrderId: string): Promise<Invoice | null> {
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("job_order_id", jobOrderId)
      .maybeSingle();

    if (error || !data) return null;
    return data as Invoice;
  },

  /**
   * Fetch all invoices for a customer.
   */
  async getInvoicesForCustomer(customerId: string): Promise<Invoice[]> {
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (error || !data) return [];
    return data as Invoice[];
  },

  /**
   * Mark an invoice as paid.
   */
  async markInvoicePaid(
    invoiceId: string,
    method: Invoice["payment_method"],
  ): Promise<boolean> {
    const { error } = await supabase
      .from("invoices")
      .update({
        payment_status: "paid",
        payment_method: method,
        paid_date: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    if (error) {
      console.error("Error marking invoice paid:", error);
      return false;
    }
    return true;
  },
};
