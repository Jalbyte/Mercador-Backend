import { supabase } from '../config/supabase.js'

export interface ProductKey {
  id: string
  product_id: string
  license_key: string
  user_id?: string
  status?: string
  expiration_date?: string
  activation_limit?: number
  created_at?: string
  updated_at?: string
}

export interface CreateProductKeyData {
  product_id: string
  license_key: string
  user_id?: string
  status?: string
  expiration_date?: string
  activation_limit?: number
}

export async function listProductKeys(product_id?: string): Promise<ProductKey[]> {
  let query = supabase.from('product_keys').select('*')
  if (product_id) query = query.eq('product_id', product_id)
  const { data, error } = await query
  if (error) throw new Error(`Failed to fetch product keys: ${error.message}`)
  return data || []
}

export async function createProductKey(data: CreateProductKeyData): Promise<ProductKey> {
  const { data: key, error } = await supabase
    .from('product_keys')
    .insert({ ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .select()
    .single()
  if (error) throw new Error(`Failed to create product key: ${error.message}`)
  return key
}

export async function deleteProductKey(id: string): Promise<void> {
  const { error } = await supabase.from('product_keys').delete().eq('id', id)
  if (error) throw new Error(`Failed to delete product key: ${error.message}`)
}
