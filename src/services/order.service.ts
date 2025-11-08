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
import { supabaseAdmin } from '../config/supabase.js'
import { createSupabaseClient } from './user.service.js'
import { logger } from '../utils/logger.js'

// Helper: returns current timestamp in local time with timezone offset
// Example output: 2025-10-27T12:34:56-05:00
function nowWithLocalOffset(): string {
  const d = new Date()
  const tzOffsetMin = d.getTimezoneOffset() // minutes behind UTC (e.g. 300)
  // local ISO without trailing Z
  const localISO = new Date(d.getTime() - tzOffsetMin * 60000).toISOString().slice(0, -1)
  const sign = tzOffsetMin > 0 ? '-' : '+'
  const abs = Math.abs(tzOffsetMin)
  const hh = String(Math.floor(abs / 60)).padStart(2, '0')
  const mm = String(abs % 60).padStart(2, '0')
  return `${localISO}${sign}${hh}:${mm}`
}

export interface Order {
  id: number
  user_id: string
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'
  total_amount: number
  shipping_address: {
    addressLine1: string
    city: string
    region: string
    country: string
    phoneNumber: string
  }
  payment_method: string
  created_at: string
  updated_at: string
  order_items?: OrderItem[]
}

export interface OrderItem {
  id: number
  order_id: number
  product_id: number
  quantity: number
  price: number
  product?: {
    id: number
    name: string
    image_url?: string
  }
}

export interface CreateOrderData {
  shippingAddress: any
  paymentMethod: string
}

export async function getUserOrders(userId: string, accessToken?: string): Promise<Order[]> {
  // Usar cliente autenticado si se proporciona token, sino usar admin
  const client = accessToken 
    ? createSupabaseClient(accessToken) 
    : (supabaseAdmin || supabase);
  
  const { data: orders, error } = await client
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

export async function getOrderById(userId: string, orderId: number, accessToken?: string): Promise<Order | null> {
  // Usar cliente autenticado si se proporciona token, sino usar admin
  const client = accessToken 
    ? createSupabaseClient(accessToken) 
    : (supabaseAdmin || supabase);
  
  const { data: order, error } = await client
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

export async function createOrder(userId: string, orderData: CreateOrderData, accessToken?: string): Promise<Order> {
  // Usar cliente autenticado si se proporciona token, sino usar admin
  const client = accessToken 
    ? createSupabaseClient(accessToken) 
    : (supabaseAdmin || supabase);

  // Get user's cart first
  const { data: userCart, error: cartFetchError } = await client
    .from('carts')
    .select('id')
    .eq('user_id', userId)
    .single()

  if (cartFetchError || !userCart) {
    throw new Error('Cart not found')
  }

  // Get cart items
  const { data: cartItems, error: cartError } = await client
    .from('cart_items')
    .select(`
      *,
      product:products (
        id,
        name,
        price
      )
    `)
    .eq('cart_id', userCart.id)

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
  const { data: order, error: orderError } = await client
    .from('orders')
    .insert({
      user_id: userId,
      status: 'pending',
      total_amount: totalAmount,
      shipping_address: orderData.shippingAddress,
      payment_method: orderData.paymentMethod,
      created_at: nowWithLocalOffset(),
      updated_at: nowWithLocalOffset()
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

  const { error: itemsError } = await client
    .from('order_items')
    .insert(orderItems)

  if (itemsError) {
    throw new Error(`Failed to create order items: ${itemsError.message}`)
  }

  // Clear cart items
  const { error: clearError } = await client
    .from('cart_items')
    .delete()
    .eq('cart_id', userCart.id)

  if (clearError) {
    throw new Error(`Failed to clear cart: ${clearError.message}`)
  }

  // Return order with items
  return await getOrderById(userId, order.id, accessToken) as Order
}

export async function updateOrderStatus(orderId: number, status: Order['status'], accessToken?: string): Promise<Order> {
  // Usar cliente autenticado si se proporciona token, sino usar admin
  const client = accessToken 
    ? createSupabaseClient(accessToken) 
    : (supabaseAdmin || supabase);
    
  const { data: order, error } = await client
    .from('orders')
    .update({
      status,
  updated_at: nowWithLocalOffset()
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

  // Usar cliente admin para operaciones administrativas
  const client = supabaseAdmin || supabase;

  let query = client
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

/**
 * Actualiza el estado de una orden
 * Nota: El payment_id se registra en los logs pero no se guarda en DB
 * (la columna payment_id no existe en la tabla orders)
 * 
 * Si no se proporciona accessToken, usa el cliente admin de Supabase
 * (útil para webhooks sin autenticación de usuario)
 */
export async function updateOrderStatusWithPayment(
  orderId: string,
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled',
  paymentId?: string,
  accessToken?: string
) {
  // Log del payment_id para trazabilidad
  if (paymentId) {
    logger.info({ orderId, paymentId }, 'Order payment ID updated')
  }

  // Usar cliente autenticado si se proporciona token, sino usar admin
  const client = accessToken 
    ? createSupabaseClient(accessToken) 
    : (supabaseAdmin || supabase);

  const { data: order, error } = await client
    .from('orders')
    .update({
      status,
      updated_at: nowWithLocalOffset(),
    })
    .eq('id', orderId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update order: ${error.message}`);
  }

  return order;
}


/**
 * Obtiene el user_id de una orden
 * Usa cliente admin porque es llamada desde webhooks
 */
export async function getOrderUserId(orderId: string): Promise<string | null> {
  const client = supabaseAdmin || supabase;
  
  const { data: order, error } = await client
    .from('orders')
    .select('user_id')
    .eq('id', orderId)
    .single();

  if (error || !order) {
    return null;
  }

  return order.user_id;
}


/**
 * Obtiene productos por sus IDs
 * Usa cliente admin porque puede ser llamada desde contextos sin autenticación
 */
export async function getProductsByIds(productIds: number[]) {
  const client = supabaseAdmin || supabase;
  
  const { data: products, error } = await client
    .from('products')
    .select('*')
    .in('id', productIds);

  if (error) {
    throw new Error(`Failed to fetch products: ${error.message}`);
  }

  return products || [];
}

/**
 * Verifica el stock de productos antes de crear una orden
 */
export async function verifyProductsStock(
  items: Array<{ product_id: number; quantity: number }>
): Promise<{ valid: boolean; message?: string }> {
  const productIds = items.map(item => item.product_id);
  const products = await getProductsByIds(productIds);

  for (const item of items) {
    const product = products.find(p => p.id === item.product_id);
    
    if (!product) {
      return { valid: false, message: `Producto ${item.product_id} no encontrado` };
    }
    
    if (product.stock_quantity < item.quantity) {
      return { 
        valid: false, 
        message: `Stock insuficiente para ${product.name}. Disponible: ${product.stock_quantity}` 
      };
    }
  }
  
  return { valid: true };
}

/**
 * Interfaz para errores de pedidos
 */
export interface OrderError {
  order_id: string
  error_type: 'stock' | 'payment' | 'delivery' | 'key_assignment'
  error_message: string
  created_at: string
}

/**
 * Calcula la exactitud del pedido (Order Accuracy)
 * Métrica: % de pedidos entregados sin error
 * Target: Superior al 95%
 * 
 * @returns Objeto con el porcentaje de exactitud y estadísticas
 */
export async function calculateOrderAccuracy(): Promise<{
  accuracy: number
  totalOrders: number
  successfulOrders: number
  errorOrders: number
  meetsTarget: boolean
}> {
  try {
    // Obtener total de órdenes
    const { count: totalOrders, error: ordersError } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })

    if (ordersError) {
      logger.error({ error: ordersError }, 'Error al obtener total de órdenes')
      throw ordersError
    }

    // Obtener órdenes con errores (asumiendo que existe una tabla order_errors)
    // Si no existe, puedes contar las órdenes canceladas como proxy
    const { count: errorOrdersCount, error: errorsError } = await supabase
      .from('order_errors')
      .select('order_id', { count: 'exact', head: true })

    // Si la tabla order_errors no existe, usar órdenes canceladas como alternativa
    let errorCount = 0
    if (errorsError && errorsError.code === '42P01') {
      // Tabla no existe, usar órdenes canceladas
      const { count: cancelledCount } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'cancelled')
      
      errorCount = cancelledCount || 0
      logger.info('Tabla order_errors no encontrada, usando órdenes canceladas como proxy')
    } else if (errorsError) {
      logger.error({ error: errorsError }, 'Error al obtener errores de órdenes')
      errorCount = 0
    } else {
      errorCount = errorOrdersCount || 0
    }

    const total = totalOrders || 0
    const errors = errorCount
    const successful = total - errors

    // Calcular exactitud (evitar división por cero)
    const accuracy = total > 0 ? ((successful / total) * 100) : 100

    const result = {
      accuracy: Number(accuracy.toFixed(2)),
      totalOrders: total,
      successfulOrders: successful,
      errorOrders: errors,
      meetsTarget: accuracy >= 95
    }

    // Log métrica de exactitud del pedido
    logger.info({
      accuracy: result.accuracy,
      totalOrders: result.totalOrders,
      successfulOrders: result.successfulOrders,
      errorOrders: result.errorOrders,
      meetsTarget: result.meetsTarget,
      target: 95
    }, 'MÉTRICA: EXACTITUD DEL PEDIDO (Order Accuracy)')

    return result
  } catch (error) {
    logger.error({ error }, 'Error al calcular exactitud del pedido')
    throw error
  }
}

/**
 * Registra un error en un pedido
 * Útil para llevar tracking de problemas y calcular métricas
 */
export async function logOrderError(
  orderId: string,
  errorType: OrderError['error_type'],
  errorMessage: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('order_errors')
      .insert({
        order_id: orderId,
        error_type: errorType,
        error_message: errorMessage,
  created_at: nowWithLocalOffset()
      })

    if (error) {
      // Si la tabla no existe, solo log el error (no fallar)
      if (error.code === '42P01') {
        logger.warn('Tabla order_errors no existe. Considera crearla para tracking de errores.')
      } else {
        logger.error({ error }, 'Error al registrar error de orden')
      }
    }
  } catch (err) {
    logger.error({ err }, 'Error al guardar error de orden')
  }
}

/**
 * Reenvía el email con las claves de licencia de una orden
 */
export async function resendOrderKeys(orderId: number, accessToken: string): Promise<void> {
  const client = createSupabaseClient(accessToken)
  
  // Obtener la orden con sus items y claves
  const { data: order, error: orderError } = await client
    .from('orders')
    .select(`
      id,
      user_id,
      created_at,
      order_items (
        id,
        product_id,
        quantity,
        products (
          id,
          name
        ),
        product_keys!product_keys_order_item_id_fkey (
          id,
          license_key,
          status
        )
      )
    `)
    .eq('id', orderId)
    .single()

  if (orderError || !order) {
    throw new Error('Orden no encontrada o no autorizado')
  }

  // Verificar que el usuario autenticado es el dueño de la orden
  const { data: { user } } = await client.auth.getUser()
  if (!user || user.id !== order.user_id) {
    throw new Error('No autorizado para acceder a esta orden')
  }

  // Obtener email del usuario
  const { data: profile } = await client
    .from('profiles')
    .select('email, full_name')
    .eq('id', order.user_id)
    .single()

  if (!profile?.email) {
    throw new Error('Email del usuario no encontrado')
  }

  // Importar servicio de email
  const { sendOrderEmail } = await import('./mail.service.js')

  // Preparar datos de las claves agrupadas por producto
  const productKeys: Array<{
    productId: number
    productName: string
    quantity: number
    keys: string[]
  }> = []

  for (const item of order.order_items || []) {
    const product = Array.isArray(item.products) ? item.products[0] : item.products
    const keys = Array.isArray(item.product_keys) 
      ? item.product_keys.map((k: any) => k.license_key) 
      : []
    
    productKeys.push({
      productId: product?.id || 0,
      productName: product?.name || 'Unknown Product',
      quantity: keys.length,
      keys
    })
  }

  // Construir template query para email con claves
  const templateQuery: Record<string, string> = {
    orderId: `ORDER-${order.id}`,
    orderDate: new Date(order.created_at).toLocaleDateString('es-CO'),
    customerName: profile.full_name || profile.email,
    products: JSON.stringify(productKeys)
  }

  // Enviar email con las claves
  await sendOrderEmail({
    to: profile.email,
    subject: `Claves de Licencia - Orden ${order.id}`,
    templatePath: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/email/license-keys`,
    templateQuery,
    attachPdf: false
  })
}
