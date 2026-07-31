import { supabase } from './supabaseClient'
import { Part } from '../types'

/**
 * Inventory Service
 * Handles all parts/inventory database operations
 */

export const inventoryService = {
  /**
   * Fetch all parts for a shop
   */
  async getParts(shopId: string): Promise<Part[]> {
    try {
      const { data, error } = await supabase
        .from('parts')
        .select('*')
        .eq('shop_id', shopId)
        .order('name', { ascending: true })

      if (error) throw error
      return data || []
    } catch (err) {
      console.error('Error fetching parts:', err)
      return []
    }
  },

  /**
   * Get low stock parts (quantity at or below reorder level)
   * PostgREST cannot compare two columns, so fetch and filter client-side.
   */
  async getLowStockParts(shopId: string): Promise<Part[]> {
    try {
      const { data, error } = await supabase
        .from('parts')
        .select('*')
        .eq('shop_id', shopId)
        .order('quantity_in_stock', { ascending: true })

      if (error) throw error
      return (data || []).filter(
        (p) => p.quantity_in_stock <= (p.reorder_level || 0),
      )
    } catch (err) {
      console.error('Error fetching low stock parts:', err)
      return []
    }
  },

  /**
   * Get a single part by ID
   */
  async getPartById(partId: string): Promise<Part | null> {
    try {
      const { data, error } = await supabase
        .from('parts')
        .select('*')
        .eq('id', partId)
        .single()

      if (error) throw error
      return data || null
    } catch (err) {
      console.error('Error fetching part:', err)
      return null
    }
  },

  /**
   * Create a new part
   */
  async createPart(part: Omit<Part, 'id' | 'created_at'>): Promise<Part | null> {
    try {
      const { data, error } = await supabase
        .from('parts')
        .insert([part])
        .select()
        .single()

      if (error) throw error
      console.log('✅ Part created:', data)
      return data || null
    } catch (err) {
      console.error('Error creating part:', err)
      return null
    }
  },

  /**
   * Update a part
   */
  async updatePart(partId: string, updates: Partial<Part>): Promise<Part | null> {
    try {
      const { data, error } = await supabase
        .from('parts')
        .update(updates)
        .eq('id', partId)
        .select()
        .single()

      if (error) throw error
      console.log('✅ Part updated:', data)
      return data || null
    } catch (err) {
      console.error('Error updating part:', err)
      return null
    }
  },

  /**
   * Update part stock quantity
   */
  async updatePartStock(partId: string, quantity: number): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('parts')
        .update({ quantity_in_stock: quantity })
        .eq('id', partId)

      if (error) throw error
      console.log('✅ Part stock updated')
      return true
    } catch (err) {
      console.error('Error updating part stock:', err)
      return false
    }
  },

  /**
   * Delete a part
   */
  async deletePart(partId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('parts')
        .delete()
        .eq('id', partId)

      if (error) throw error
      console.log('✅ Part deleted')
      return true
    } catch (err) {
      console.error('Error deleting part:', err)
      return false
    }
  },
}
