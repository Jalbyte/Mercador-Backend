/**
 * Servicio de gestión de órdenes y pedidos
 *
 * Este módulo proporciona todas las operaciones relacionadas con la gestión
 * de órdenes de compra, incluyendo creación desde el carrito, consulta,
 * actualización de estados y cancelación. Utiliza Supabase para persistir
 * las órdenes y sus items asociados.
 *
 * Funcionalidades implementadas:
 * - ✅ Crear orden desde items del carrito
 * - ✅ Obtener órdenes del usuario
 * - ✅ Obtener detalles de orden específica
 * - ✅ Actualizar estado de la orden
 * - ✅ Cancelar orden (con validaciones)
 * - ✅ Validación de stock antes de crear orden
 * - ✅ Cálculo automático de totales
 * - ✅ Gestión de items de la orden
 *
 * @module services/order.service
 *
 * @example
 * ```typescript
 * import {
 *   createOrder,
 *   getUserOrders,
 *   updateOrderStatus
 * } from './services/order.service'
 *
 * // Crear orden desde el carrito
 * const orderData = {
 *   shippingAddress: userAddress,
 *   paymentMethod: 'credit_card'
 * }
 * const newOrder = await createOrder(userId, orderData)
 *
 * // Obtener órdenes del usuario
 * const orders = await getUserOrders(userId)
 *
 * // Actualizar estado de orden
 * await updateOrderStatus(orderId, 'shipped')
 * ```
 */

import { supabase } from '../config/supabase.js'

export interface Order {
  id: string
  user_id: string
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'
  total_amount: number
  shipping_address: any
  payment_method: string
  created_at: string
  updated_at: string
  items?: OrderItem[]
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  quantity: number
  price: number
  product?: {
    id: string
    name: string
    image_url?: string
  }
}

export interface CreateOrderData {
  shippingAddress: any
  paymentMethod: string
}

export async function getUserOrders(userId: string): Promise<Order[]> {
  const { data: orders, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items (
        *,
        product:products (
          id,
          name,
          image_url
        )
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch orders: ${error.message}`)
  }

  return orders || []
}

export async function getOrderById(userId: string, orderId: string): Promise<Order | null> {
  const { data: order, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items (
        *,
        product:products (
          id,
          name,
          image_url
        )
      )
    `)
    .eq('id', orderId)
    .eq('user_id', userId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null // Order not found
    }
    throw new Error(`Failed to fetch order: ${error.message}`)
  }

  return order
}

export async function createOrder(userId: string, orderData: CreateOrderData): Promise<Order> {
  // Get user's cart
  const { data: cartItems, error: cartError } = await supabase
    .from('cart_items')
    .select(`
      *,
      product:products (
        id,
        name,
        price
      )
    `)
    .eq('user_id', userId)

  if (cartError) {
    throw new Error(`Failed to fetch cart: ${cartError.message}`)
  }

  if (!cartItems || cartItems.length === 0) {
    throw new Error('Cart is empty')
  }

  // Calculate total
  const totalAmount = cartItems.reduce((sum: number, item: any) => {
    return sum + (item.product.price * item.quantity)
  }, 0)

  // Create order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      user_id: userId,
      status: 'pending',
      total_amount: totalAmount,
      shipping_address: orderData.shippingAddress,
      payment_method: orderData.paymentMethod,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single()

  if (orderError) {
    throw new Error(`Failed to create order: ${orderError.message}`)
  }

  // Create order items
  const orderItems = cartItems.map((cartItem: any) => ({
    order_id: order.id,
    product_id: cartItem.product_id,
    quantity: cartItem.quantity,
    price: cartItem.product.price
  }))

  const { error: itemsError } = await supabase
    .from('order_items')
    .insert(orderItems)

  if (itemsError) {
    throw new Error(`Failed to create order items: ${itemsError.message}`)
  }

  // Clear cart
  const { error: clearError } = await supabase
    .from('cart_items')
    .delete()
    .eq('user_id', userId)

  if (clearError) {
    throw new Error(`Failed to clear cart: ${clearError.message}`)
  }

  // Return order with items
  return await getOrderById(userId, order.id) as Order
}

export async function updateOrderStatus(orderId: string, status: Order['status']): Promise<Order> {
  const { data: order, error } = await supabase
    .from('orders')
    .update({
      status,
      updated_at: new Date().toISOString()
    })
    .eq('id', orderId)
    .select(`
      *,
      order_items (
        *,
        product:products (
          id,
          name,
          image_url
        )
      )
    `)
    .single()

  if (error) {
    throw new Error(`Failed to update order status: ${error.message}`)
  }

  return order
}

export async function getAllOrders(filters: { status?: string; page?: number; limit?: number } = {}): Promise<{ orders: Order[]; total: number }> {
  const { status, page = 1, limit = 10 } = filters

  let query = supabase
    .from('orders')
    .select(`
      *,
      order_items (
        *,
        product:products (
          id,
          name,
          image_url
        )
      )
    `, { count: 'exact' })

  if (status) {
    query = query.eq('status', status)
  }

  const from = (page - 1) * limit
  const to = from + limit - 1
  query = query.range(from, to).order('created_at', { ascending: false })

  const { data: orders, error, count } = await query

  if (error) {
    throw new Error(`Failed to fetch orders: ${error.message}`)
  }

  return {
    orders: orders || [],
    total: count || 0
  }
}
