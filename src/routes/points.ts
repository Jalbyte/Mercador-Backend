/**
 * Rutas de API para el Sistema de Puntos
 * 
 * Endpoints:
 * - GET /points/balance - Obtener balance actual del usuario
 * - GET /points/transactions - Obtener historial de transacciones
 * - POST /points/validate - Validar si el usuario tiene puntos suficientes
 * 
 * @module routes/points
 */

import { Hono } from 'hono'
import { 
  getUserPointsBalance, 
  getPointsTransactions,
  getOrderPoints,
  pointsToPesos,
  pesosToPoints,
  POINTS_CONSTANTS
} from '../services/points.service.js'
import { logger } from '../utils/logger.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'

const points = new Hono()

// Aplicar autenticación a todas las rutas
points.use('*', authMiddleware)

/**
 * GET /points/balance
 * Obtener balance de puntos del usuario autenticado
 * 
 * Response:
 * {
 *   balance: 1000,
 *   totalEarned: 1500,
 *   totalSpent: 500,
 *   valueInPesos: 10000,
 *   constants: { pointsPer1000Pesos: 100, pesosPerPoint: 10 }
 * }
 */
points.get('/balance', async (c) => {
  try {
    const userId = c.get('userId') as string

    if (!userId) {
      return c.json({ error: 'Usuario no autenticado' }, 401)
    }

    const balance = await getUserPointsBalance(userId)

    if (!balance) {
      return c.json({ error: 'No se pudo obtener el balance de puntos' }, 500)
    }

    // Calcular valor en pesos
    const valueInPesos = pointsToPesos(balance.balance)

    return c.json({
      balance: balance.balance,
      totalEarned: balance.total_earned,
      totalSpent: balance.total_spent,
      valueInPesos: parseFloat(valueInPesos.toString()),
      constants: {
        pointsPer1000Pesos: POINTS_CONSTANTS.POINTS_PER_1000_PESOS,
        pesosPerPoint: POINTS_CONSTANTS.PESOS_PER_POINT,
        earningDivisor: POINTS_CONSTANTS.EARNING_DIVISOR
      }
    })

  } catch (error) {
    logger.error({ error }, 'Error getting points balance')
    return c.json({ error: 'Error interno del servidor' }, 500)
  }
})

/**
 * GET /points/transactions
 * Obtener historial de transacciones de puntos
 * 
 * Query params:
 * - limit (opcional): Número de transacciones a retornar (default: 50, max: 100)
 * - offset (opcional): Número de transacciones a saltar (default: 0)
 * 
 * Response:
 * {
 *   transactions: [
 *     {
 *       id: "uuid",
 *       amount: 250,
 *       type: "earned",
 *       description: "Compra de orden #123",
 *       orderId: 123,
 *       createdAt: "2024-01-01T00:00:00Z",
 *       valueInPesos: 2500
 *     }
 *   ],
 *   pagination: {
 *     limit: 50,
 *     offset: 0,
 *     hasMore: true
 *   }
 * }
 */
points.get('/transactions', async (c) => {
  try {
    const userId = c.get('userId') as string

    if (!userId) {
      return c.json({ error: 'Usuario no autenticado' }, 401)
    }

    // Parsear query params
    const limitParam = c.req.query('limit')
    const offsetParam = c.req.query('offset')

    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0

    if (isNaN(limit) || isNaN(offset) || limit < 1 || offset < 0) {
      return c.json({ error: 'Parámetros inválidos' }, 400)
    }

    // Obtener transacciones (obtener una extra para saber si hay más)
    const transactions = await getPointsTransactions(userId, limit + 1, offset)

    const hasMore = transactions.length > limit
    const transactionsToReturn = hasMore ? transactions.slice(0, limit) : transactions

    // Formatear transacciones con valor en pesos
    const formattedTransactions = transactionsToReturn.map(t => ({
      id: t.id,
      amount: t.amount,
      type: t.type,
      description: t.description,
      orderId: t.order_id ? Number(t.order_id) : undefined,
      createdAt: t.created_at,
      valueInPesos: parseFloat(pointsToPesos(Math.abs(t.amount)).toString()),
      metadata: t.metadata
    }))

    return c.json({
      transactions: formattedTransactions,
      pagination: {
        limit,
        offset,
        hasMore
      }
    })

  } catch (error) {
    logger.error({ error }, 'Error getting points transactions')
    return c.json({ error: 'Error interno del servidor' }, 500)
  }
})

/**
 * POST /points/validate
 * Validar si el usuario tiene suficientes puntos
 * 
 * Body:
 * {
 *   pointsToUse: 100
 * }
 * 
 * Response:
 * {
 *   valid: true,
 *   currentBalance: 1000,
 *   requestedPoints: 100,
 *   discountAmount: 1000,
 *   remainingBalance: 900
 * }
 */
points.post('/validate', async (c) => {
  try {
    const userId = c.get('userId') as string

    if (!userId) {
      return c.json({ error: 'Usuario no autenticado' }, 401)
    }

    const body = await c.req.json()
    const { pointsToUse } = body

    if (!pointsToUse || typeof pointsToUse !== 'number' || pointsToUse < 0) {
      return c.json({ error: 'pointsToUse debe ser un número positivo' }, 400)
    }

    // Obtener balance actual
    const balance = await getUserPointsBalance(userId)

    if (!balance) {
      return c.json({ error: 'No se pudo obtener el balance de puntos' }, 500)
    }

    // Validar si tiene suficientes puntos
    const valid = balance.balance >= pointsToUse
    const discountAmount = parseFloat(pointsToPesos(pointsToUse).toString())

    return c.json({
      valid,
      currentBalance: balance.balance,
      requestedPoints: pointsToUse,
      discountAmount,
      remainingBalance: valid ? balance.balance - pointsToUse : balance.balance
    })

  } catch (error) {
    logger.error({ error }, 'Error validating points')
    return c.json({ error: 'Error interno del servidor' }, 500)
  }
})

/**
 * GET /points/calculate-earn
 * Calcular cuántos puntos se ganarían por una compra
 * 
 * Query params:
 * - amount: Monto de la compra en pesos
 * 
 * Response:
 * {
 *   purchaseAmount: 100000,
 *   pointsToEarn: 250,
 *   valueInPesos: 2500
 * }
 */
points.get('/calculate-earn', async (c) => {
  try {
    const userId = c.get('userId') as string

    if (!userId) {
      return c.json({ error: 'Usuario no autenticado' }, 401)
    }

    const amountParam = c.req.query('amount')

    if (!amountParam) {
      return c.json({ error: 'Se requiere el parámetro amount' }, 400)
    }

    const amount = parseFloat(amountParam)

    if (isNaN(amount) || amount < 0) {
      return c.json({ error: 'amount debe ser un número positivo' }, 400)
    }

    // Calcular puntos a ganar
    const pointsToEarn = Math.floor(amount / POINTS_CONSTANTS.EARNING_DIVISOR)
    const valueInPesos = parseFloat(pointsToPesos(pointsToEarn).toString())

    return c.json({
      purchaseAmount: amount,
      pointsToEarn,
      valueInPesos
    })

  } catch (error) {
    logger.error({ error }, 'Error calculating earn points')
    return c.json({ error: 'Error interno del servidor' }, 500)
  }
})

/**
 * GET /points/convert
 * Convertir entre puntos y pesos
 * 
 * Query params:
 * - points (opcional): Puntos a convertir a pesos
 * - pesos (opcional): Pesos a convertir a puntos
 * 
 * Response:
 * {
 *   points: 100,
 *   pesos: 1000
 * }
 */
points.get('/convert', async (c) => {
  try {
    const userId = c.get('userId') as string

    if (!userId) {
      return c.json({ error: 'Usuario no autenticado' }, 401)
    }

    const pointsParam = c.req.query('points')
    const pesosParam = c.req.query('pesos')

    if (!pointsParam && !pesosParam) {
      return c.json({ error: 'Se requiere points o pesos' }, 400)
    }

    if (pointsParam && pesosParam) {
      return c.json({ error: 'Solo se puede convertir points o pesos, no ambos' }, 400)
    }

    if (pointsParam) {
      const points = parseInt(pointsParam, 10)
      if (isNaN(points) || points < 0) {
        return c.json({ error: 'points debe ser un número positivo' }, 400)
      }

      const pesos = parseFloat(pointsToPesos(points).toString())
      return c.json({ points, pesos })
    }

    if (pesosParam) {
      const pesos = parseFloat(pesosParam)
      if (isNaN(pesos) || pesos < 0) {
        return c.json({ error: 'pesos debe ser un número positivo' }, 400)
      }

      const points = pesosToPoints(pesos)
      return c.json({ points, pesos })
    }

  } catch (error) {
    logger.error({ error }, 'Error converting points/pesos')
    return c.json({ error: 'Error interno del servidor' }, 500)
  }
})

/**
 * GET /points/order/:orderId
 * Obtener información de puntos de una orden específica
 * 
 * Response:
 * {
 *   data: {
 *     points_used: 100,
 *     points_earned: 250,
 *     discount_amount: 1000
 *   }
 * }
 */
points.get('/order/:orderId', async (c) => {
  try {
    const userId = c.get('userId') as string

    if (!userId) {
      return c.json({ error: 'Usuario no autenticado' }, 401)
    }

    const orderIdParam = c.req.param('orderId')
    const orderId = BigInt(orderIdParam)

    if (!orderIdParam || isNaN(Number(orderIdParam))) {
      return c.json({ error: 'orderId inválido' }, 400)
    }

    // Obtener información de puntos de la orden
    const orderPoints = await getOrderPoints(orderId)

    if (!orderPoints) {
      return c.json({ error: 'No se encontró información de puntos para esta orden' }, 404)
    }

    return c.json({
      data: {
        points_used: orderPoints.points_used,
        points_earned: orderPoints.points_earned,
        discount_amount: parseFloat(orderPoints.discount_amount.toString())
      }
    })

  } catch (error) {
    logger.error({ error }, 'Error getting order points')
    return c.json({ error: 'Error interno del servidor' }, 500)
  }
})

export default points
