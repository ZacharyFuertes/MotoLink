import { supabase } from './supabaseClient'
import { Product } from '../types/index'

/**
 * Product Service
 * Handles all product and featured product database operations
 */

// Products Operations
export const productService = {
  /**
   * Fetch all products for a shop
   */
  async getAllProducts(shopId: string): Promise<Product[]> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('shop_id', shopId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data || []
    } catch (err) {
      console.error('Error fetching products:', err)
      return []
    }
  },

  /**
   * Get a single product by ID
   */
  async getProductById(productId: string): Promise<Product | null> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single()

      if (error) throw error
      return data || null
    } catch (err) {
      console.error('Error fetching product:', err)
      return null
    }
  },

  /**
   * Create a new product
   */
  async createProduct(product: Omit<Product, 'id' | 'created_at'>): Promise<Product | null> {
    try {
      const { data, error } = await supabase
        .from('products')
        .insert([product])
        .select()
        .single()

      if (error) throw error
      console.log('✅ Product created:', data)
      return data || null
    } catch (err) {
      console.error('Error creating product:', err)
      return null
    }
  },

  /**
   * Update a product
   */
  async updateProduct(productId: string, updates: Partial<Product>): Promise<Product | null> {
    try {
      const { data, error } = await supabase
        .from('products')
        .update(updates)
        .eq('id', productId)
        .select()
        .single()

      if (error) throw error
      console.log('✅ Product updated:', data)
      return data || null
    } catch (err) {
      console.error('Error updating product:', err)
      return null
    }
  },

  /**
   * Delete a product
   */
  async deleteProduct(productId: string): Promise<boolean> {
    try {
      // First delete featured products referencing this product
      await supabase
        .from('featured_products')
        .delete()
        .eq('product_id', productId)

      // Then delete the product
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId)

      if (error) throw error
      console.log('✅ Product deleted')
      return true
    } catch (err) {
      console.error('Error deleting product:', err)
      return false
    }
  },
}
