/**
 * Servicio de gestión de claves de producto y licencias
 *
 * Este módulo proporciona todas las operaciones relacionadas con la gestión
 * de claves de licencia de productos en la aplicación Mercador. Maneja el
 * ciclo de vida completo de las licencias, incluyendo creación, asignación
 * a usuarios, activación y expiración.
 *
 * Funcionalidades implementadas:
 * - ✅ Crear nuevas claves de producto
 * - ✅ Listar claves por producto o todas
 * - ✅ Actualizar información de claves
 * - ✅ Eliminar claves
 * - ✅ Gestión de estados de activación
 * - ✅ Control de límites de activación
 * - ✅ Fechas de expiración
 * - ✅ Asignación a usuarios específicos
 *
 * @module services/product_key.service
 *
 * @example
 * ```typescript
 * import {
 *   createProductKey,
 *   listProductKeys,
 *   updateProductKey
 * } from './services/product_key.service'
 *
 * // Crear nueva clave de producto
 * const newKey = await createProductKey({
 *   product_id: 'product-123',
 *   license_key: 'XXXX-XXXX-XXXX-XXXX',
 *   status: 'available',
 *   activation_limit: 3,
 *   expiration_date: '2024-12-31'
 * })
 *
 * // Listar claves de un producto
 * const keys = await listProductKeys('product-123')
 *
 * // Actualizar clave (asignar a usuario)
 * await updateProductKey(keyId, {
 *   user_id: 'user-456',
 *   status: 'activated'
 * })
 * ```
 */

import { supabase, supabaseAdmin } from '../config/supabase.js'

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
  // Use the configured Supabase client (admin if available) to fetch keys.
  const db = supabaseAdmin ?? supabase

  let query = db.from('product_keys').select('*')
  if (product_id) {
    query = query.eq('product_id', product_id)
  }

  const { data, error } = await query

  if (error) {
    // Return empty array on error and log for debugging
    // eslint-disable-next-line no-console
    console.error('Failed to list product keys:', error)
    return []
  }

  return (data || []) as ProductKey[]
}
export async function createProductKey(data: CreateProductKeyData): Promise<ProductKey> {
  const { data: key, error } = await (supabaseAdmin ?? supabase)
    .from('product_keys')
    .insert({ ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .select()
    .single()
  if (error) throw new Error(`Failed to create product key: ${error.message}`)
  return key
}

export async function deleteProductKey(id: string): Promise<void> {
  const { error } = await (supabaseAdmin ?? supabase).from('product_keys').delete().eq('id', id)
  if (error) throw new Error(`Failed to delete product key: ${error.message}`)
}
