/**
 * Rutas de Administración para el Sistema de Puntos
 * 
 * Endpoints para que los admins gestionen puntos de usuarios:
 * - GET /admin/points/users - Listar usuarios con sus puntos
 * - GET /admin/points/user/:userId - Ver detalles de puntos de un usuario
 * - POST /admin/points/adjust - Ajustar manualmente puntos de un usuario
 * - GET /admin/points/transactions - Ver todas las transacciones (con filtros)
 * - GET /admin/points/stats - Estadísticas generales del sistema
 * 
 * @module routes/admin-points
 */

import { Hono } from 'hono'
import { 
  getUserPointsBalance, 
  addPoints,
  getPointsTransactions,
  pointsToPesos,
  POINTS_CONSTANTS
} from '../services/points.service.js'
import { logger } from '../utils/logger.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'
import { supabase } from '../config/supabase.js'

const adminPoints = new Hono()

// Middleware: Verificar que el usuario es administrador
const adminMiddleware = async (c: any, next: any) => {
  const userId = c.get('userId') as string
  
  if (!userId) {
    return c.json({ error: 'No autenticado' }, 401)
  }

  // Verificar si es admin
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()

  if (error || !profile || profile.role !== 'admin') {
    logger.warn({ userId }, 'Intento de acceso no autorizado a rutas de admin')
    return c.json({ error: 'No autorizado - Se requieren permisos de administrador' }, 403)
  }

  await next()
}

// Aplicar autenticación y verificación de admin a todas las rutas
adminPoints.use('*', authMiddleware, adminMiddleware)

/**
 * GET /admin/points/users
 * Listar todos los usuarios con su balance de puntos
 * 
 * Query params:
 * - limit (opcional): Número de usuarios (default: 50, max: 100)
 * - offset (opcional): Offset para paginación (default: 0)
 * - sortBy (opcional): Campo de ordenamiento (balance|total_earned|total_spent, default: balance)
 * - order (opcional): Orden (asc|desc, default: desc)
 * 
 * Response:
 * {
 *   users: [{
 *     userId: "uuid",
 *     email: "user@example.com",
 *     fullName: "John Doe",
 *     balance: 1000,
 *     totalEarned: 1500,
 *     totalSpent: 500,
 *     valueInPesos: 10000,
 *     createdAt: "2024-01-01",
 *     updatedAt: "2024-01-01"
 *   }],
 *   pagination: { limit, offset, total, hasMore }
 * }
 */
adminPoints.get('/users', async (c) => {
  try {
    const limitParam = c.req.query('limit')
    const offsetParam = c.req.query('offset')
    const sortBy = c.req.query('sortBy') || 'balance'
    const order = c.req.query('order') || 'desc'

    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0

    // Validar parámetros
    if (isNaN(limit) || isNaN(offset) || limit < 1 || offset < 0) {
      return c.json({ error: 'Parámetros inválidos' }, 400)
    }

    if (!['balance', 'total_earned', 'total_spent', 'created_at'].includes(sortBy)) {
      return c.json({ error: 'sortBy inválido' }, 400)
    }

    if (!['asc', 'desc'].includes(order)) {
      return c.json({ error: 'order inválido' }, 400)
    }

    // Obtener total de usuarios con puntos
    const { count } = await supabase
      .from('user_points')
      .select('*', { count: 'exact', head: true })

    // Obtener usuarios con puntos + info de perfil
    const { data: usersPoints, error } = await supabase
      .from('user_points')
      .select(`
        id,
        user_id,
        balance,
        total_earned,
        total_spent,
        created_at,
        updated_at
      `)
      .order(sortBy, { ascending: order === 'asc' })
      .range(offset, offset + limit - 1)

    if (error) {
      logger.error({ error }, 'Error fetching users points')
      return c.json({ error: 'Error al obtener usuarios con puntos' }, 500)
    }

    // Obtener info de usuarios de auth.users y profiles
    const userIds = usersPoints?.map(up => up.user_id) || []
    
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('id', userIds)

    // Combinar datos
    const users = usersPoints?.map(up => {
      const profile = profiles?.find(p => p.id === up.user_id)
      return {
        userId: up.user_id,
        email: profile?.email || 'N/A',
        fullName: profile?.full_name || 'N/A',
        balance: up.balance,
        totalEarned: up.total_earned,
        totalSpent: up.total_spent,
        valueInPesos: parseFloat(pointsToPesos(up.balance).toString()),
        createdAt: up.created_at,
        updatedAt: up.updated_at
      }
    })

    return c.json({
      users,
      pagination: {
        limit,
        offset,
        total: count || 0,
        hasMore: (offset + limit) < (count || 0)
      }
    })

  } catch (error) {
    logger.error({ error }, 'Error in GET /admin/points/users')
    return c.json({ error: 'Error interno del servidor' }, 500)
  }
})

/**
 * GET /admin/points/user/:userId
 * Ver detalles completos de puntos de un usuario específico
 * 
 * Response:
 * {
 *   user: { email, fullName },
 *   points: { balance, totalEarned, totalSpent, valueInPesos },
 *   recentTransactions: [...],
 *   stats: { ordersWithPoints, totalPointsUsed, totalPointsEarned }
 * }
 */
adminPoints.get('/user/:userId', async (c) => {
  try {
    const userId = c.req.param('userId')

    if (!userId) {
      return c.json({ error: 'userId requerido' }, 400)
    }

    // Obtener info del usuario
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .single()

    if (!profile) {
      return c.json({ error: 'Usuario no encontrado' }, 404)
    }

    // Obtener balance de puntos
    const balance = await getUserPointsBalance(userId)

    if (!balance) {
      return c.json({ 
        user: profile,
        points: {
          balance: 0,
          totalEarned: 0,
          totalSpent: 0,
          valueInPesos: 0
        },
        recentTransactions: [],
        stats: {
          ordersWithPoints: 0,
          totalPointsUsed: 0,
          totalPointsEarned: 0
        }
      })
    }

    // Obtener transacciones recientes
    const transactions = await getPointsTransactions(userId, 10, 0)

    // Obtener estadísticas de órdenes
    const { data: orderStats } = await supabase
      .from('order_points')
      .select('points_used, points_earned')
      .eq('user_id', userId)

    const stats = {
      ordersWithPoints: orderStats?.length || 0,
      totalPointsUsed: orderStats?.reduce((sum, o) => sum + o.points_used, 0) || 0,
      totalPointsEarned: orderStats?.reduce((sum, o) => sum + o.points_earned, 0) || 0
    }

    return c.json({
      user: {
        email: profile.email,
        fullName: profile.full_name
      },
      points: {
        balance: balance.balance,
        totalEarned: balance.total_earned,
        totalSpent: balance.total_spent,
        valueInPesos: parseFloat(pointsToPesos(balance.balance).toString())
      },
      recentTransactions: transactions.map(t => ({
        id: t.id,
        amount: t.amount,
        type: t.type,
        description: t.description,
        orderId: t.order_id ? Number(t.order_id) : undefined,
        createdAt: t.created_at,
        valueInPesos: parseFloat(pointsToPesos(Math.abs(t.amount)).toString())
      })),
      stats
    })

  } catch (error) {
    logger.error({ error }, 'Error in GET /admin/points/user/:userId')
    return c.json({ error: 'Error interno del servidor' }, 500)
  }
})

/**
 * POST /admin/points/adjust
 * Ajustar manualmente puntos de un usuario (agregar o quitar)
 * 
 * Body:
 * {
 *   userId: "uuid",
 *   amount: 100, // Positivo para agregar, negativo para quitar
 *   reason: "Ajuste manual por soporte"
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   newBalance: 1100,
 *   transaction: {...}
 * }
 */
adminPoints.post('/adjust', async (c) => {
  try {
    const adminId = c.get('userId') as string
    const body = await c.req.json()
    const { userId, amount, reason } = body

    // Validar inputs
    if (!userId || typeof amount !== 'number' || !reason) {
      return c.json({ 
        error: 'userId, amount (number) y reason son requeridos' 
      }, 400)
    }

    if (amount === 0) {
      return c.json({ error: 'amount no puede ser 0' }, 400)
    }

    // Verificar que el usuario existe
    const { data: userExists } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single()

    if (!userExists) {
      return c.json({ error: 'Usuario no encontrado' }, 404)
    }

    // Obtener info del admin
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', adminId)
      .single()

    // Preparar descripción con info del admin
    const description = `${reason} (Admin: ${adminProfile?.email || adminId})`

    // Agregar o deducir puntos
    let success
    if (amount > 0) {
      success = await addPoints(userId, amount, 'adjustment', description)
    } else {
      // Para deducir, usamos addPoints con amount negativo
      success = await addPoints(userId, amount, 'adjustment', description)
    }

    if (!success) {
      return c.json({ error: 'Error al ajustar puntos' }, 500)
    }

    // Obtener nuevo balance y última transacción
    const newBalance = await getUserPointsBalance(userId)
    
    // Obtener la última transacción del usuario
    const lastTransactions = await getPointsTransactions(userId, 1, 0)
    const lastTransaction = lastTransactions[0]

    logger.info({ 
      adminId, 
      userId, 
      amount, 
      reason,
      newBalance: newBalance?.balance 
    }, 'Admin adjusted user points')

    return c.json({
      success: true,
      newBalance: newBalance?.balance || 0,
      transaction: lastTransaction ? {
        id: lastTransaction.id,
        amount: lastTransaction.amount,
        type: lastTransaction.type,
        description: lastTransaction.description,
        createdAt: lastTransaction.created_at
      } : undefined
    })

  } catch (error) {
    logger.error({ error }, 'Error in POST /admin/points/adjust')
    return c.json({ 
      error: error instanceof Error ? error.message : 'Error interno del servidor' 
    }, 500)
  }
})

/**
 * GET /admin/points/transactions
 * Ver todas las transacciones del sistema (con filtros)
 * 
 * Query params:
 * - limit, offset: Paginación
 * - type: Filtrar por tipo (earned|spent|refund|adjustment)
 * - userId: Filtrar por usuario específico
 * - startDate, endDate: Rango de fechas
 * 
 * Response:
 * {
 *   transactions: [...],
 *   pagination: {...}
 * }
 */
adminPoints.get('/transactions', async (c) => {
  try {
    const limitParam = c.req.query('limit')
    const offsetParam = c.req.query('offset')
    const type = c.req.query('type')
    const userId = c.req.query('userId')
    const startDate = c.req.query('startDate')
    const endDate = c.req.query('endDate')

    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0

    // Construir query
    let query = supabase
      .from('points_transactions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    // Aplicar filtros
    if (type) {
      query = query.eq('type', type)
    }

    if (userId) {
      query = query.eq('user_id', userId)
    }

    if (startDate) {
      query = query.gte('created_at', startDate)
    }

    if (endDate) {
      query = query.lte('created_at', endDate)
    }

    // Aplicar paginación
    const { data: transactions, error, count } = await query
      .range(offset, offset + limit - 1)

    if (error) {
      logger.error({ error }, 'Error fetching all transactions')
      return c.json({ error: 'Error al obtener transacciones' }, 500)
    }

    // Obtener emails de usuarios
    const userIds = [...new Set(transactions?.map(t => t.user_id) || [])]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email')
      .in('id', userIds)

    // Formatear transacciones
    const formattedTransactions = transactions?.map(t => {
      const profile = profiles?.find(p => p.id === t.user_id)
      return {
        id: t.id,
        userId: t.user_id,
        userEmail: profile?.email || 'N/A',
        amount: t.amount,
        type: t.type,
        description: t.description,
        orderId: t.order_id ? Number(t.order_id) : undefined,
        createdAt: t.created_at,
        valueInPesos: parseFloat(pointsToPesos(Math.abs(t.amount)).toString()),
        metadata: t.metadata
      }
    })

    return c.json({
      transactions: formattedTransactions,
      pagination: {
        limit,
        offset,
        total: count || 0,
        hasMore: (offset + limit) < (count || 0)
      }
    })

  } catch (error) {
    logger.error({ error }, 'Error in GET /admin/points/transactions')
    return c.json({ error: 'Error interno del servidor' }, 500)
  }
})

/**
 * GET /admin/points/stats
 * Estadísticas generales del sistema de puntos
 * 
 * Response:
 * {
 *   totalUsers: 1000,
 *   totalPointsInCirculation: 50000,
 *   totalPointsEarned: 100000,
 *   totalPointsSpent: 50000,
 *   valueInPesos: 500000,
 *   transactionsByType: { earned: 500, spent: 300, refund: 50, adjustment: 20 },
 *   topUsers: [...]
 * }
 */
adminPoints.get('/stats', async (c) => {
  try {
    // Total de usuarios con puntos
    const { count: totalUsers } = await supabase
      .from('user_points')
      .select('*', { count: 'exact', head: true })

    // Suma total de puntos en circulación
    const { data: balanceSum } = await supabase
      .from('user_points')
      .select('balance')

    const totalPointsInCirculation = balanceSum?.reduce((sum, row) => sum + row.balance, 0) || 0

    // Total earned y spent
    const { data: totalsData } = await supabase
      .from('user_points')
      .select('total_earned, total_spent')

    const totalPointsEarned = totalsData?.reduce((sum, row) => sum + row.total_earned, 0) || 0
    const totalPointsSpent = totalsData?.reduce((sum, row) => sum + row.total_spent, 0) || 0

    // Transacciones por tipo
    const { data: transactionsByType } = await supabase
      .from('points_transactions')
      .select('type')

    const typeCount = transactionsByType?.reduce((acc: any, t) => {
      acc[t.type] = (acc[t.type] || 0) + 1
      return acc
    }, {}) || {}

    // Top 10 usuarios con más puntos
    const { data: topUsersData } = await supabase
      .from('user_points')
      .select('user_id, balance, total_earned')
      .order('balance', { ascending: false })
      .limit(10)

    const topUserIds = topUsersData?.map(u => u.user_id) || []
    const { data: topProfiles } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('id', topUserIds)

    const topUsers = topUsersData?.map(u => {
      const profile = topProfiles?.find(p => p.id === u.user_id)
      return {
        userId: u.user_id,
        email: profile?.email || 'N/A',
        fullName: profile?.full_name || 'N/A',
        balance: u.balance,
        totalEarned: u.total_earned,
        valueInPesos: parseFloat(pointsToPesos(u.balance).toString())
      }
    })

    return c.json({
      totalUsers: totalUsers || 0,
      totalPointsInCirculation,
      totalPointsEarned,
      totalPointsSpent,
      valueInPesos: parseFloat(pointsToPesos(totalPointsInCirculation).toString()),
      constants: POINTS_CONSTANTS,
      transactionsByType: typeCount,
      topUsers
    })

  } catch (error) {
    logger.error({ error }, 'Error in GET /admin/points/stats')
    return c.json({ error: 'Error interno del servidor' }, 500)
  }
})

export default adminPoints
