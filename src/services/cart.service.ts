/**
 * Servicio de gestión del carrito de compras
 *
 * Este módulo proporciona todas las operaciones relacionadas con el carrito
 * de compras de los usuarios, incluyendo consulta, modificación y cálculo
 * de totales. Utiliza Supabase como base de datos para persistir los items
 * del carrito.
 *
 * Funcionalidades implementadas:
 * - ✅ Obtener carrito completo del usuario
 * - ✅ Agregar productos al carrito
 * - ✅ Actualizar cantidad de items
 * - ✅ Eliminar items del carrito
 * - ✅ Limpiar carrito completo
 * - ✅ Cálculo automático de totales
 * - ✅ Validación de productos existentes
 *
 * @module services/cart.service
 *
 * @example
 * ```typescript
 * import { getUserCart, addToCart, updateCartItem } from './services/cart.service'
 *
 * // Obtener carrito del usuario
 * const cart = await getUserCart(userId)
 * console.log(`Total: $${cart.total}, Items: ${cart.itemCount}`)
 *
 * // Agregar producto al carrito
 * const newItem = await addToCart(userId, productId, 2)
 *
 * // Actualizar cantidad
 * await updateCartItem(itemId, 5)
 * ```
 */

import { supabase } from '../config/supabase.js'

export interface CartItem {
  id: string
  user_id: string
  product_id: string
  quantity: number
  created_at: string
  updated_at: string
  product?: {
    id: string
    name: string
    price: number
    image_url?: string
  }
}

export interface Cart {
  items: CartItem[]
  total: number
  itemCount: number
}

export async function getUserCart(userId: string): Promise<Cart> {
  const { data: cartItems, error } = await supabase
    .from('cart_items')
    .select(`
      *,
      product:products (
        id,
        name,
        price,
        image_url
      )
    `)
    .eq('user_id', userId)

  if (error) {
    throw new Error(`Failed to fetch cart: ${error.message}`)
  }

  const items = cartItems || []
  const total = items.reduce((sum: number, item: any) => {
    const price = item.product?.price || 0
    return sum + (price * item.quantity)
  }, 0)

  return {
    items,
    total,
    itemCount: items.length
  }
}

export async function addToCart(userId: string, productId: string, quantity: number): Promise<CartItem> {
  // Check if item already exists in cart
  const { data: existingItem } = await supabase
    .from('cart_items')
    .select('*')
    .eq('user_id', userId)
    .eq('product_id', productId)
    .single()

  if (existingItem) {
    // Update quantity
    const newQuantity = existingItem.quantity + quantity
    const { data: updatedItem, error } = await supabase
      .from('cart_items')
      .update({
        quantity: newQuantity,
        updated_at: new Date().toISOString()
      })
      .eq('id', existingItem.id)
      .select(`
        *,
        product:products (
          id,
          name,
          price,
          image_url
        )
      `)
      .single()

    if (error) {
      throw new Error(`Failed to update cart item: ${error.message}`)
    }

    return updatedItem
  } else {
    // Add new item
    const { data: newItem, error } = await supabase
      .from('cart_items')
      .insert({
        user_id: userId,
        product_id: productId,
        quantity,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select(`
        *,
        product:products (
          id,
          name,
          price,
          image_url
        )
      `)
      .single()

    if (error) {
      throw new Error(`Failed to add item to cart: ${error.message}`)
    }

    return newItem
  }
}

export async function updateCartItem(userId: string, itemId: string, quantity: number): Promise<CartItem> {
  const { data: updatedItem, error } = await supabase
    .from('cart_items')
    .update({
      quantity,
      updated_at: new Date().toISOString()
    })
    .eq('id', itemId)
    .eq('user_id', userId)
    .select(`
      *,
      product:products (
        id,
        name,
        price,
        image_url
      )
    `)
    .single()

  if (error) {
    throw new Error(`Failed to update cart item: ${error.message}`)
  }

  return updatedItem
}

export async function removeFromCart(userId: string, itemId: string): Promise<void> {
  const { error } = await supabase
    .from('cart_items')
    .delete()
    .eq('id', itemId)
    .eq('user_id', userId)

  if (error) {
    throw new Error(`Failed to remove item from cart: ${error.message}`)
  }
}

export async function clearCart(userId: string): Promise<void> {
  const { error } = await supabase
    .from('cart_items')
    .delete()
    .eq('user_id', userId)

  if (error) {
    throw new Error(`Failed to clear cart: ${error.message}`)
  }
}

export async function getCartItemCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('cart_items')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (error) {
    throw new Error(`Failed to get cart item count: ${error.message}`)
  }

  return count || 0
}
