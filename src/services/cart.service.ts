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
import { createSupabaseClient } from './user.service.js'
import { logger } from '../utils/logger.js'

export interface CartItem {
  id: number
  cart_id?: number
  product_id: number
  quantity: number
  created_at: string
  updated_at: string
  product?: {
    id: number
    name: string
    price: number
    image_url?: string
    stock_quantity?: number
  }
  max_quantity?: number // Stock disponible
  is_available?: boolean // Si el producto aún existe
  has_enough_stock?: boolean // Si hay suficiente stock
}

export interface Cart {
  items: CartItem[]
  total: number
  itemCount: number
  valid?: boolean // Si todos los items son válidos
}

export async function getUserCart(userId: string, accessToken?: string): Promise<Cart> {
  // Usar cliente autenticado si se proporciona token
  const client = accessToken ? createSupabaseClient(accessToken) : supabase
  
  // Primero obtener el cart del usuario
  const { data: userCart, error: cartError } = await client
    .from('carts')
    .select('id')
    .eq('user_id', userId)
    .single()

  if (cartError) {
    // Si no existe un cart para el usuario, devolver cart vacío
    if (cartError.code === 'PGRST116') {
      return { items: [], total: 0, itemCount: 0, valid: true }
    }
    throw new Error(`Failed to fetch cart: ${cartError.message}`)
  }

  // Ahora obtener los items del cart con stock_quantity
  const { data: cartItems, error } = await client
    .from('cart_items')
    .select(`
      *,
      product:products (
        id,
        name,
        price,
        image_url,
        stock_quantity
      )
    `)
    .eq('cart_id', userCart.id)

  if (error) {
    throw new Error(`Failed to fetch cart items: ${error.message}`)
  }

  // Validar cada item contra el stock actual
  let allValid = true
  const items = (cartItems || []).map((item: any) => {
    const product = item.product
    const isAvailable = !!product // El producto aún existe
    const stockQuantity = product?.stock_quantity || 0
    const hasEnoughStock = item.quantity <= stockQuantity
    const isValid = isAvailable && hasEnoughStock

    if (!isValid) {
      allValid = false
    }

    return {
      ...item,
      max_quantity: stockQuantity,
      is_available: isAvailable,
      has_enough_stock: hasEnoughStock
    }
  })

  const total = items.reduce((sum: number, item: any) => {
    const price = item.product?.price || 0
    return sum + (price * item.quantity)
  }, 0)

  return {
    items,
    total,
    itemCount: items.length,
    valid: allValid
  }
}

export async function addToCart(userId: string, productId: number, quantity: number, accessToken?: string): Promise<CartItem> {
  // Usar cliente autenticado si se proporciona token
  const client = accessToken ? createSupabaseClient(accessToken) : supabase
  
  // Validar stock antes de agregar
  const { data: product, error: productError } = await client
    .from('products')
    .select('id, stock_quantity')
    .eq('id', productId)
    .single()

  if (productError) {
    throw new Error(`Product not found: ${productError.message}`)
  }

  if (!product || product.stock_quantity < quantity) {
    const availableStock = product?.stock_quantity || 0;
    logger.error({ productId, quantity, availableStock }, 'Cantidad de producto sobrepasa límite de stock');
    throw new Error(`la cantidad del producto sobrepasa su límite ${quantity}. Disponible: ${availableStock}`)
  }

  // Primero obtener o crear el cart del usuario
  let userCart = null

  const { data: existingCart, error: cartError } = await client
    .from('carts')
    .select('id')
    .eq('user_id', userId)
    .single()

  if (cartError && cartError.code !== 'PGRST116') {
    throw new Error(`Failed to fetch user cart: ${cartError.message}`)
  }

  if (!existingCart) {
    // Crear un nuevo cart para el usuario
    const { data: newCart, error: createCartError } = await client
      .from('carts')
      .insert({ user_id: userId })
      .select('id')
      .single()

    if (createCartError) {
      throw new Error(`Failed to create user cart: ${createCartError.message}`)
    }

    userCart = newCart
  } else {
    userCart = existingCart
  }

  // Check if item already exists in cart
  const { data: existingItem } = await client
    .from('cart_items')
    .select('*')
    .eq('cart_id', userCart.id)
    .eq('product_id', productId)
    .single()

  if (existingItem) {
    // Update quantity - validar que no exceda el stock
    const newQuantity = existingItem.quantity + quantity
    
    if (newQuantity > product.stock_quantity) {
      const availableStock = product.stock_quantity || 0;
      logger.error({ productId, newQuantity, availableStock }, 'Nueva cantidad sobrepasa límite de stock al agregar al carrito');
      throw new Error(`la cantidad del producto sobrepasa su límite ${newQuantity}. Disponible: ${availableStock}`)
    }
    
    const { data: updatedItem, error } = await client
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
    const { data: newItem, error } = await client
      .from('cart_items')
      .insert({
        cart_id: userCart.id,
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

export async function updateCartItem(userId: string, itemId: number, quantity: number, accessToken?: string): Promise<CartItem> {
  // Usar cliente autenticado si se proporciona token
  const client = accessToken ? createSupabaseClient(accessToken) : supabase
  
  // Primero obtener el cart del usuario
  const { data: userCart, error: cartError } = await client
    .from('carts')
    .select('id')
    .eq('user_id', userId)
    .single()

  if (cartError) {
    throw new Error(`Failed to fetch user cart: ${cartError.message}`)
  }

  // Obtener el item del carrito para validar el producto
  const { data: cartItem, error: itemError } = await client
    .from('cart_items')
    .select('product_id')
    .eq('id', itemId)
    .eq('cart_id', userCart.id)
    .single()

  if (itemError) {
    throw new Error(`Cart item not found: ${itemError.message}`)
  }

  // Validar stock
  const { data: product, error: productError } = await client
    .from('products')
    .select('id, stock_quantity')
    .eq('id', cartItem.product_id)
    .single()

  if (productError) {
    throw new Error(`Product not found: ${productError.message}`)
  }

  if (!product || product.stock_quantity < quantity) {
    const availableStock = product?.stock_quantity || 0;
    logger.error({ productId: cartItem.product_id, itemId, quantity, availableStock }, 'Cantidad de actualización sobrepasa límite de stock');
    throw new Error(`la cantidad del producto sobrepasa su límite ${quantity}. Disponible: ${availableStock}`)
  }

  const { data: updatedItem, error } = await client
    .from('cart_items')
    .update({
      quantity,
      updated_at: new Date().toISOString()
    })
    .eq('id', itemId)
    .eq('cart_id', userCart.id)
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

export async function removeFromCart(userId: string, itemId: number, accessToken?: string): Promise<void> {
  // Usar cliente autenticado si se proporciona token
  const client = accessToken ? createSupabaseClient(accessToken) : supabase
  
  // Primero obtener el cart del usuario
  const { data: userCart, error: cartError } = await client
    .from('carts')
    .select('id')
    .eq('user_id', userId)
    .single()

  if (cartError) {
    throw new Error(`Failed to fetch user cart: ${cartError.message}`)
  }

  const { error } = await client
    .from('cart_items')
    .delete()
    .eq('id', itemId)
    .eq('cart_id', userCart.id)

  if (error) {
    throw new Error(`Failed to remove item from cart: ${error.message}`)
  }
}

export async function clearCart(userId: string, accessToken?: string): Promise<void> {
  // Usar cliente autenticado si se proporciona token
  const client = accessToken ? createSupabaseClient(accessToken) : supabase
  
  // Primero obtener el cart del usuario
  const { data: userCart, error: cartError } = await client
    .from('carts')
    .select('id')
    .eq('user_id', userId)
    .single()

  if (cartError) {
    // Si no hay cart, no hay nada que limpiar
    if (cartError.code === 'PGRST116') {
      return
    }
    throw new Error(`Failed to fetch user cart: ${cartError.message}`)
  }

  const { error } = await client
    .from('cart_items')
    .delete()
    .eq('cart_id', userCart.id)

  if (error) {
    throw new Error(`Failed to clear cart: ${error.message}`)
  }
}

export async function getCartItemCount(userId: string, accessToken?: string): Promise<number> {
  // Usar cliente autenticado si se proporciona token
  const client = accessToken ? createSupabaseClient(accessToken) : supabase
  
  // Primero obtener el cart del usuario
  const { data: userCart, error: cartError } = await client
    .from('carts')
    .select('id')
    .eq('user_id', userId)
    .single()

  if (cartError) {
    // Si no hay cart, el count es 0
    if (cartError.code === 'PGRST116') {
      return 0
    }
    throw new Error(`Failed to fetch user cart: ${cartError.message}`)
  }

  const { count, error } = await client
    .from('cart_items')
    .select('*', { count: 'exact', head: true })
    .eq('cart_id', userCart.id)

  if (error) {
    throw new Error(`Failed to get cart item count: ${error.message}`)
  }

  return count || 0
}

/**
 * Maneja múltiples operaciones de carrito en batch
 */
export async function manageBatchCartItems(
  userId: string,
  operations: Array<{ productId: number; quantity: number }>,
  accessToken?: string
): Promise<{ success: boolean; results: Array<{ productId: number; action: string; error?: string }> }> {
  const results: Array<{ productId: number; action: string; error?: string }> = []

  for (const operation of operations) {
    try {
      if (operation.quantity === 0) {
        // Eliminar item
        const cart = await getUserCart(userId, accessToken)
        const existingItem = cart.items?.find(item => item.product_id === operation.productId)
        
        if (existingItem) {
          await removeFromCart(userId, existingItem.id, accessToken)
          results.push({ productId: operation.productId, action: 'removed' })
        } else {
          results.push({ productId: operation.productId, action: 'skipped' })
        }
      } else {
        // Verificar si existe
        const cart = await getUserCart(userId, accessToken)
        const existingItem = cart.items?.find(item => item.product_id === operation.productId)

        if (existingItem) {
          // Actualizar
          await updateCartItem(userId, existingItem.id, operation.quantity, accessToken)
          results.push({ productId: operation.productId, action: 'updated' })
        } else {
          // Agregar
          await addToCart(userId, operation.productId, operation.quantity, accessToken)
          results.push({ productId: operation.productId, action: 'added' })
        }
      }
    } catch (error) {
      results.push({
        productId: operation.productId,
        action: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  return {
    success: results.every(r => r.action !== 'failed'),
    results
  }
}
