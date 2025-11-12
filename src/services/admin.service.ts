/**
 * Servicio de administración y estadísticas
 *
 * Este módulo proporciona funcionalidades administrativas para el panel
 * de administración, incluyendo estadísticas consolidadas, métricas de ventas,
 * análisis de inventario y gestión de órdenes.
 *
 * Funcionalidades implementadas:
 * - ✅ Dashboard con estadísticas consolidadas
 * - ✅ Métricas de ventas y revenue
 * - ✅ Análisis de productos y stock
 * - ✅ Estadísticas de usuarios
 * - ✅ Identificación de productos más vendidos
 * - ✅ Alertas de bajo stock
 *
 * @module services/admin.service
 *
 * @example
 * ```typescript
 * import { getDashboardStats } from './services/admin.service'
 *
 * // Obtener estadísticas del dashboard
 * const stats = await getDashboardStats()
 * ```
 */

import { supabase, supabaseAdmin } from '../config/supabase.js'
import { createSupabaseClient } from './user.service.js'
import { logger } from '../utils/logger.js'

export interface DashboardStats {
  totalSales: number
  totalRevenue: number
  totalProducts: number
  totalUsers: number
  lowStockProducts: number
  recentOrders: number
  topSellingProduct: string
  averageOrderValue: number
}

export interface OrderWithItems {
  id: number
  user_id: string
  user?: {
    id: string
    full_name?: string
    email?: string
  }
  status: string
  total_amount: number
  shipping_address: any
  payment_method: string
  created_at: string
  updated_at: string
  order_items?: Array<{
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
  }>
}

/**
 * Obtiene estadísticas consolidadas para el dashboard del administrador
 * @param adminId ID del usuario administrador
 * @param accessToken Token de acceso opcional
 * @returns Estadísticas del dashboard
 */
export async function getDashboardStats(adminId: string, accessToken?: string): Promise<DashboardStats> {
  // Verificar permisos de administrador
  const userClient = accessToken ? createSupabaseClient(accessToken) : (supabaseAdmin || supabase)
  
  const { data: adminProfile, error: adminError } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', adminId)
    .single()

  if (adminError || !adminProfile || adminProfile.role !== 'admin') {
    throw new Error('No autorizado')
  }

  // Usar cliente admin para operaciones de estadísticas
  const client = supabaseAdmin || supabase

  // 1. Total de ventas (órdenes completadas)
  const { count: totalSales, error: salesError } = await client
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .in('status', ['confirmed', 'shipped', 'delivered'])

  if (salesError) {
    throw new Error(`Failed to fetch total sales: ${salesError.message}`)
  }

  // 2. Total de ingresos (suma de total_amount de órdenes completadas)
  const { data: revenueData, error: revenueError } = await client
    .from('orders')
    .select('total_amount')
    .in('status', ['confirmed', 'shipped', 'delivered'])

  if (revenueError) {
    throw new Error(`Failed to fetch total revenue: ${revenueError.message}`)
  }

  const totalRevenue = revenueData?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0

  // 3. Total de productos (solo productos activos)
  const { count: totalProducts, error: productsError } = await client
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')

  if (productsError) {
    throw new Error(`Failed to fetch total products: ${productsError.message}`)
  }

  // 4. Total de usuarios
  const { count: totalUsers, error: usersError } = await client
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('is_deleted', false)

  if (usersError) {
    throw new Error(`Failed to fetch total users: ${usersError.message}`)
  }

  // 5. Productos con bajo stock (menos de 10 unidades y estado activo)
  const { count: lowStockProducts, error: lowStockError } = await client
    .from('products')
    .select('*', { count: 'exact', head: true })
    .lt('stock_quantity', 10)
    .eq('status', 'active')

  if (lowStockError) {
    throw new Error(`Failed to fetch low stock products: ${lowStockError.message}`)
  }

  // 6. Órdenes recientes (últimos 30 días)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { count: recentOrders, error: recentOrdersError } = await client
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', thirtyDaysAgo.toISOString())

  if (recentOrdersError) {
    throw new Error(`Failed to fetch recent orders: ${recentOrdersError.message}`)
  }

  // 7. Producto más vendido
  const { data: orderItems, error: orderItemsError } = await client
    .from('order_items')
    .select(`
      product_id,
      quantity,
      product:products!inner(
        id,
        name,
        status
      )
    `)

  if (orderItemsError) {
    throw new Error(`Failed to fetch order items: ${orderItemsError.message}`)
  }

  // Agrupar por producto y sumar cantidades (solo productos activos)
  const productSales = new Map<number, { name: string; totalQuantity: number }>()
  
  orderItems?.forEach((item: any) => {
    // Solo contar productos activos
    if (!item.product || item.product.status !== 'active') return
    
    const productId = item.product_id
    const productName = item.product.name || 'Unknown Product'
    const quantity = item.quantity || 0

    if (productSales.has(productId)) {
      const existing = productSales.get(productId)!
      existing.totalQuantity += quantity
    } else {
      productSales.set(productId, { name: productName, totalQuantity: quantity })
    }
  })

  // Encontrar el producto más vendido
  let topSellingProduct = 'N/A'
  let maxQuantity = 0

  productSales.forEach((value) => {
    if (value.totalQuantity > maxQuantity) {
      maxQuantity = value.totalQuantity
      topSellingProduct = value.name
    }
  })

  // 8. Valor promedio de orden
  const averageOrderValue = totalSales && totalSales > 0 ? Math.round(totalRevenue / totalSales) : 0

  return {
    totalSales: totalSales || 0,
    totalRevenue: Math.round(totalRevenue),
    totalProducts: totalProducts || 0,
    totalUsers: totalUsers || 0,
    lowStockProducts: lowStockProducts || 0,
    recentOrders: recentOrders || 0,
    topSellingProduct,
    averageOrderValue
  }
}

/**
 * Obtiene todas las órdenes del sistema con paginación y filtros
 * @param adminId ID del usuario administrador
 * @param filters Filtros opcionales (status, page, limit)
 * @param accessToken Token de acceso opcional
 * @returns Lista de órdenes con paginación
 */
export async function getAllOrdersAdmin(
  adminId: string,
  filters: { status?: string; page?: number; limit?: number } = {},
  accessToken?: string
): Promise<{ orders: OrderWithItems[]; total: number; pagination: any }> {
  // Verificar permisos de administrador
  const userClient = accessToken ? createSupabaseClient(accessToken) : (supabaseAdmin || supabase)
  
  const { data: adminProfile, error: adminError } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', adminId)
    .single()

  if (adminError || !adminProfile || adminProfile.role !== 'admin') {
    throw new Error('No autorizado')
  }

  const { status, page = 1, limit = 10 } = filters

  // Usar cliente admin para operaciones administrativas
  const client = supabaseAdmin || supabase

  let query = client
    .from('orders')
    .select(`
      *,
      user:profiles (id, full_name, email),
      order_items (
        *,
        product:products (
          id,
          name,
          image_url,
          price,
          status
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
    logger.error({ error }, 'Error fetching admin orders')
    throw new Error(`Failed to fetch orders: ${error.message}`)
  }

  return {
    orders: orders || [],
    total: count || 0,
    pagination: {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit)
    }
  }
}

/**
 * Obtiene estadísticas detalladas de todos los productos
 * @param adminId ID del usuario administrador
 * @param accessToken Token de acceso opcional
 * @returns Estadísticas de productos con ventas
 */
export async function getProductsWithStats(
  adminId: string,
  accessToken?: string
): Promise<Array<{
  id: number
  name: string
  price: number
  stock_quantity: number
  status: string
  total_sold: number
  revenue: number
}>> {
  // Verificar permisos de administrador
  const userClient = accessToken ? createSupabaseClient(accessToken) : (supabaseAdmin || supabase)
  
  const { data: adminProfile, error: adminError } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', adminId)
    .single()

  if (adminError || !adminProfile || adminProfile.role !== 'admin') {
    throw new Error('No autorizado')
  }

  const client = supabaseAdmin || supabase

  // Obtener todos los productos
  const { data: products, error: productsError } = await client
    .from('products')
    .select('id, name, price, stock_quantity, status')
    .eq('status', 'active')
    .order('name')

  if (productsError) {
    throw new Error(`Failed to fetch products: ${productsError.message}`)
  }

  // Obtener estadísticas de ventas por producto
  const { data: orderItems, error: orderItemsError } = await client
    .from('order_items')
    .select('product_id, quantity, price')

  if (orderItemsError) {
    throw new Error(`Failed to fetch order items: ${orderItemsError.message}`)
  }

  // Crear mapa de estadísticas de ventas
  const salesStats = new Map<number, { total_sold: number; revenue: number }>()
  
  orderItems?.forEach((item: any) => {
    const productId = item.product_id
    const quantity = item.quantity || 0
    const itemRevenue = (item.price || 0) * quantity

    if (salesStats.has(productId)) {
      const existing = salesStats.get(productId)!
      existing.total_sold += quantity
      existing.revenue += itemRevenue
    } else {
      salesStats.set(productId, { total_sold: quantity, revenue: itemRevenue })
    }
  })

  // Combinar productos con estadísticas
  return (products || []).map((product: any) => {
    const stats = salesStats.get(product.id) || { total_sold: 0, revenue: 0 }
    return {
      id: product.id,
      name: product.name,
      price: product.price,
      stock_quantity: product.stock_quantity,
      status: product.status,
      total_sold: stats.total_sold,
      revenue: Math.round(stats.revenue)
    }
  })
}

/**
 * Obtiene estadísticas generales del negocio (overview completo)
 */
export async function getOverviewStats(adminId: string, accessToken?: string) {
  const userClient = accessToken ? createSupabaseClient(accessToken) : (supabaseAdmin || supabase)
  
  const { data: adminProfile } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', adminId)
    .single()

  if (!adminProfile || adminProfile.role !== 'admin') {
    throw new Error('No autorizado')
  }

  const client = supabaseAdmin || supabase

  // Total revenue
  const { data: orders } = await client
    .from('orders')
    .select('total_amount, created_at')
    .in('status', ['confirmed', 'shipped', 'delivered'])

  const totalRevenue = orders?.reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0
  const totalOrders = orders?.length || 0

  // Total users
  const { count: totalUsers } = await client
    .from('profiles')
    .select('*', { count: 'exact', head: true })

  // Total products
  const { count: totalProducts } = await client
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')

  // Avg order value
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0

  // Growth (comparar con mes anterior)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  
  const sixtyDaysAgo = new Date()
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

  const { data: lastMonth } = await client
    .from('orders')
    .select('total_amount')
    .gte('created_at', thirtyDaysAgo.toISOString())
    .in('status', ['confirmed', 'shipped', 'delivered'])

  const { data: previousMonth } = await client
    .from('orders')
    .select('total_amount')
    .gte('created_at', sixtyDaysAgo.toISOString())
    .lt('created_at', thirtyDaysAgo.toISOString())
    .in('status', ['confirmed', 'shipped', 'delivered'])

  const lastMonthRevenue = lastMonth?.reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0
  const previousMonthRevenue = previousMonth?.reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0
  
  const revenueGrowth = previousMonthRevenue > 0 
    ? ((lastMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100 
    : 0

  const ordersGrowth = previousMonth && previousMonth.length > 0
    ? ((lastMonth?.length || 0) - previousMonth.length) / previousMonth.length * 100
    : 0

  // Conversion rate (usuarios que han hecho al menos 1 pedido)
  const { count: usersWithOrders } = await client
    .from('orders')
    .select('user_id', { count: 'exact', head: true })
    .in('status', ['confirmed', 'shipped', 'delivered'])

  const conversionRate = totalUsers && totalUsers > 0 ? ((usersWithOrders || 0) / totalUsers) * 100 : 0

  return {
    totalRevenue: Math.round(totalRevenue),
    totalOrders,
    totalUsers: totalUsers || 0,
    totalProducts: totalProducts || 0,
    avgOrderValue: Math.round(avgOrderValue),
    conversionRate: Math.round(conversionRate * 100) / 100,
    revenueGrowth: Math.round(revenueGrowth * 100) / 100,
    ordersGrowth: Math.round(ordersGrowth * 100) / 100
  }
}

/**
 * Obtiene ventas por período (7d, 30d, 90d)
 */
export async function getSalesByPeriod(adminId: string, period: '7d' | '30d' | '90d', accessToken?: string) {
  const userClient = accessToken ? createSupabaseClient(accessToken) : (supabaseAdmin || supabase)
  
  const { data: adminProfile } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', adminId)
    .single()

  if (!adminProfile || adminProfile.role !== 'admin') {
    throw new Error('No autorizado')
  }

  const client = supabaseAdmin || supabase

  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  const { data: orders } = await client
    .from('orders')
    .select('total_amount, created_at')
    .gte('created_at', startDate.toISOString())
    .in('status', ['confirmed', 'shipped', 'delivered'])
    .order('created_at', { ascending: true })

  // Agrupar por día
  const salesByDate: Record<string, { revenue: number; orders: number }> = {}

  orders?.forEach(order => {
    const date = order.created_at.split('T')[0]
    if (!salesByDate[date]) {
      salesByDate[date] = { revenue: 0, orders: 0 }
    }
    salesByDate[date].revenue += order.total_amount || 0
    salesByDate[date].orders += 1
  })

  const sales = Object.entries(salesByDate).map(([date, data]) => ({
    date,
    revenue: Math.round(data.revenue),
    orders: data.orders
  }))

  const totalRevenue = sales.reduce((sum, s) => sum + s.revenue, 0)
  const totalOrders = sales.reduce((sum, s) => sum + s.orders, 0)

  return {
    period,
    sales,
    totalRevenue,
    totalOrders
  }
}

/**
 * Obtiene los productos más vendidos
 */
export async function getTopProducts(adminId: string, limit: number = 10, accessToken?: string) {
  const userClient = accessToken ? createSupabaseClient(accessToken) : (supabaseAdmin || supabase)
  
  const { data: adminProfile } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', adminId)
    .single()

  if (!adminProfile || adminProfile.role !== 'admin') {
    throw new Error('No autorizado')
  }

  const client = supabaseAdmin || supabase

  const { data: orderItems } = await client
    .from('order_items')
    .select('product_id, quantity, price, products(id, name, image_url, stock_quantity)')

  // Agrupar por producto
  const productSales: Record<number, { 
    id: number
    name: string
    image_url: string | null
    total_sold: number
    revenue: number
    stock_quantity: number
  }> = {}

  orderItems?.forEach((item: any) => {
    const product = item.products
    if (!product) return

    if (!productSales[product.id]) {
      productSales[product.id] = {
        id: product.id,
        name: product.name,
        image_url: product.image_url,
        total_sold: 0,
        revenue: 0,
        stock_quantity: product.stock_quantity
      }
    }

    productSales[product.id].total_sold += item.quantity || 0
    productSales[product.id].revenue += (item.price || 0) * (item.quantity || 0)
  })

  return Object.values(productSales)
    .sort((a, b) => b.total_sold - a.total_sold)
    .slice(0, limit)
    .map(p => ({
      ...p,
      revenue: Math.round(p.revenue)
    }))
}

/**
 * Obtiene productos con bajo stock
 */
export async function getLowStockProducts(adminId: string, threshold: number = 10, accessToken?: string) {
  const userClient = accessToken ? createSupabaseClient(accessToken) : (supabaseAdmin || supabase)
  
  const { data: adminProfile } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', adminId)
    .single()

  if (!adminProfile || adminProfile.role !== 'admin') {
    throw new Error('No autorizado')
  }

  const client = supabaseAdmin || supabase

  const { data: products } = await client
    .from('products')
    .select('id, name, stock_quantity, status, image_url')
    .lte('stock_quantity', threshold)
    .eq('status', 'active')
    .order('stock_quantity', { ascending: true })

  return products || []
}

/**
 * Obtiene usuarios registrados recientemente
 */
export async function getRecentUsers(adminId: string, limit: number = 10, accessToken?: string) {
  const userClient = accessToken ? createSupabaseClient(accessToken) : (supabaseAdmin || supabase)
  
  const { data: adminProfile } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', adminId)
    .single()

  if (!adminProfile || adminProfile.role !== 'admin') {
    throw new Error('No autorizado')
  }

  const client = supabaseAdmin || supabase

  const { data: users } = await client
    .from('profiles')
    .select('id, email, full_name, country, created_at, role')
    .order('created_at', { ascending: false })
    .limit(limit)

  return users || []
}

/**
 * Obtiene las órdenes más recientes
 */
export async function getRecentOrders(adminId: string, limit: number = 10, accessToken?: string) {
  const userClient = accessToken ? createSupabaseClient(accessToken) : (supabaseAdmin || supabase)
  
  const { data: adminProfile } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', adminId)
    .single()

  if (!adminProfile || adminProfile.role !== 'admin') {
    throw new Error('No autorizado')
  }

  const client = supabaseAdmin || supabase

  const { data: orders } = await client
    .from('orders')
    .select(`
      id,
      user_id,
      status,
      total_amount,
      shipping_address,
      payment_method,
      created_at,
      updated_at,
      order_items(
        id,
        order_id,
        product_id,
        quantity,
        price,
        products(id, name, image_url)
      )
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  return orders || []
}

/**
 * Obtiene las categorías más vendidas
 */
export async function getTopCategories(adminId: string, accessToken?: string) {
  const userClient = accessToken ? createSupabaseClient(accessToken) : (supabaseAdmin || supabase)
  
  const { data: adminProfile } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', adminId)
    .single()

  if (!adminProfile || adminProfile.role !== 'admin') {
    throw new Error('No autorizado')
  }

  const client = supabaseAdmin || supabase

  const { data: orderItems } = await client
    .from('order_items')
    .select('quantity, price, products(category)')

  // Agrupar por categoría
  const categoryStats: Record<string, { 
    total_sold: number
    revenue: number
    product_count: Set<number>
    percentage: number
  }> = {}

  orderItems?.forEach((item: any) => {
    const category = item.products?.category || 'Sin categoría'
    
    if (!categoryStats[category]) {
      categoryStats[category] = {
        total_sold: 0,
        revenue: 0,
        product_count: new Set(),
        percentage: 0
      }
    }

    categoryStats[category].total_sold += item.quantity || 0
    categoryStats[category].revenue += (item.price || 0) * (item.quantity || 0)
    // Añadir product_id al conjunto para contabilizar productos distintos por categoría
    if (item.product_id) {
      categoryStats[category].product_count.add(item.product_id)
    }
    
  })

  // Calcular porcentaje de revenue por categoría
  const totalRevenueAcross = Object.values(categoryStats).reduce((s, st) => s + (st.revenue || 0), 0)

  return Object.entries(categoryStats)
    .map(([category, stats]) => {
      const roundedRevenue = Math.round(stats.revenue)
      const percentage = totalRevenueAcross > 0 ? Math.round((stats.revenue / totalRevenueAcross) * 10000) / 100 : 0
      return {
        category,
        total_sold: stats.total_sold,
        revenue: roundedRevenue,
        product_count: stats.product_count.size,
        percentage
      }
    })
    .sort((a, b) => b.revenue - a.revenue)
}

/**
 * Obtiene estadísticas de conversión
 */
export async function getConversionStats(adminId: string, accessToken?: string) {
  const userClient = accessToken ? createSupabaseClient(accessToken) : (supabaseAdmin || supabase)
  
  const { data: adminProfile } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', adminId)
    .single()

  if (!adminProfile || adminProfile.role !== 'admin') {
    throw new Error('No autorizado')
  }

  const client = supabaseAdmin || supabase

  // Total de usuarios registrados
  const { count: totalVisitors } = await client
    .from('profiles')
    .select('*', { count: 'exact', head: true })

  // Usuarios que han comprado
  const { data: purchasers } = await client
    .from('orders')
    .select('user_id')
    .in('status', ['confirmed', 'shipped', 'delivered'])

  const uniquePurchasers = new Set(purchasers?.map(p => p.user_id))
  const totalPurchases = uniquePurchasers.size

  // Conversion rate
  const conversionRate = totalVisitors && totalVisitors > 0 
    ? (totalPurchases / totalVisitors) * 100 
    : 0

  // Carritos abandonados (carts con items pero sin orden)
  const { data: carts } = await client
    .from('carts')
    .select('id, user_id')

  const { data: orders } = await client
    .from('orders')
    .select('user_id')

  const usersWithOrders = new Set(orders?.map(o => o.user_id))
  const abandonedCarts = carts?.filter(c => !usersWithOrders.has(c.user_id)).length || 0

  const abandonmentRate = carts && carts.length > 0
    ? (abandonedCarts / carts.length) * 100
    : 0

  return {
    conversionRate: Math.round(conversionRate * 100) / 100,
    totalVisitors: totalVisitors || 0,
    totalPurchases,
    avgTimeToConvert: 0, // Requeriría tracking de sesiones
    abandonmentRate: Math.round(abandonmentRate * 100) / 100
  }
}
