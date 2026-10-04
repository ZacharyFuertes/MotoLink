import { supabase } from './supabaseClient'
import { User } from '../types'

/**
 * A MotoLink customer account returned by the owner booking search.
 *
 * Deliberately narrow: this is the only customer data that leaves the server,
 * because the search has to bypass the `users` SELECT policies to reach
 * customers the calling owner is not linked to.
 */
export interface RegisteredCustomer {
  id: string
  name: string
  phone: string | null
  email: string
  /** True when the customer already belongs to one of the owner's shops. */
  is_shop_member: boolean
}

/**
 * Customers Service
 * Handles all customer and vehicle database operations
 */

export const customerService = {
  /**
   * Fetch all customers for a shop
   */
  async getCustomers(shopId: string): Promise<User[]> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('shop_id', shopId)
        .eq('role', 'customer')
        .order('name', { ascending: true })

      if (error) throw error
      return data || []
    } catch (err) {
      console.error('Error fetching customers:', err)
      return []
    }
  },

  /**
   * Search MotoLink customer accounts for the owner booking flow.
   *
   * Searches every role='customer' row on the platform, not just the calling
   * owner's shop — a customer who signed up but has never booked here has
   * shop_id = NULL and cannot be reached through `users` under the owner RLS
   * policies at all, so this runs through the SECURITY DEFINER
   * search_registered_customers() RPC.
   *
   * An empty `query` returns the most recently created accounts, so the picker
   * opens populated instead of blank.
   *
   * Unlike every other method on this service this one THROWS instead of
   * logging and returning an empty list: a swallowed error would render as
   * "no customers found", which is indistinguishable from a genuine miss and
   * would hide the case where the RPC has not been created yet.
   */
  async searchRegisteredCustomers(
    query: string,
    limit: number = 8,
  ): Promise<RegisteredCustomer[]> {
    const { data, error } = await supabase.rpc('search_registered_customers', {
      p_query: (query || '').trim(),
      p_limit: limit,
    })

    if (error) throw error

    return (data as RegisteredCustomer[]) || []
  },

  /**
   * Get a single customer by ID
   */
  async getCustomerById(customerId: string): Promise<User | null> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', customerId)
        .single()

      if (error) throw error
      return data || null
    } catch (err) {
      console.error('Error fetching customer:', err)
      return null
    }
  },

  /**
   * Create a new customer
   */
  async createCustomer(customer: Omit<User, 'id' | 'created_at' | 'updated_at'>): Promise<User | null> {
    try {
      const { data, error } = await supabase
        .from('users')
        .insert([{ ...customer, role: 'customer' }])
        .select()
        .single()

      if (error) throw error
      console.log('✅ Customer created:', data)
      return data || null
    } catch (err) {
      console.error('Error creating customer:', err)
      return null
    }
  },

  /**
   * Update a customer
   */
  async updateCustomer(customerId: string, updates: Partial<User>): Promise<User | null> {
    try {
      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', customerId)
        .select()
        .single()

      if (error) throw error
      console.log('✅ Customer updated:', data)
      return data || null
    } catch (err) {
      console.error('Error updating customer:', err)
      return null
    }
  },

  /**
   * Delete a customer and all related records
   * Deletes appointments and vehicles first to handle foreign key constraints
   */
  async deleteCustomer(customerId: string): Promise<boolean> {
    try {
      // First, delete all appointments for this customer
      const { error: appointmentError } = await supabase
        .from('appointments')
        .delete()
        .eq('customer_id', customerId)

      if (appointmentError) throw appointmentError

      // Then, delete all vehicles for this customer
      const { error: vehicleError } = await supabase
        .from('vehicles')
        .delete()
        .eq('customer_id', customerId)

      if (vehicleError) throw vehicleError

      // Finally, delete the customer user record
      const { error: userError } = await supabase
        .from('users')
        .delete()
        .eq('id', customerId)

      if (userError) throw userError

      console.log('✅ Customer and all related records deleted')
      return true
    } catch (err) {
      console.error('Error deleting customer:', err)
      return false
    }
  },

  /**
   * Get customer with appointment count
   */
  async getCustomerStats(customerId: string): Promise<any> {
    try {
      const customer = await this.getCustomerById(customerId)
      if (!customer) return null

      const { data: appointments, error: appointmentError } = await supabase
        .from('appointments')
        .select('id')
        .eq('customer_id', customerId)

      const { data: vehicles, error: vehicleError } = await supabase
        .from('vehicles')
        .select('id')
        .eq('customer_id', customerId)

      if (appointmentError) throw appointmentError
      if (vehicleError) throw vehicleError

      return {
        ...customer,
        total_visits: appointments?.length || 0,
        total_vehicles: vehicles?.length || 0,
      }
    } catch (err) {
      console.error('Error fetching customer stats:', err)
      return null
    }
  },
}
