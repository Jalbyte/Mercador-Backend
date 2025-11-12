/**
 * Servicio de Gestión de Puntos de Recompensa
 * 
 * Sistema de puntos donde:
 * - 100 puntos = $1,000 COP
 * - Por cada compra: total_compra / 400 puntos ganados
 * - Ejemplo: Compra de $100,000 → 250 puntos ($2,500 de valor)
 * - Los puntos se pueden usar en futuras compras
 * - En devoluciones, se reembolsa proporcionalmente
 * 
 * @module services/points.service
 */

import { PostgrestError } from '@supabase/supabase-js'
import { supabase, supabaseAdmin } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

// Constantes del sistema de puntos
export const POINTS_CONSTANTS = {
  POINTS_PER_1000_PESOS: 100,           // 100 puntos = $1,000
  PESOS_PER_POINT: 10,                   // 1 punto = $10
  EARNING_DIVISOR: 400,                  // Ganar total_compra / 400 puntos
} as const

/**
 * Balance de puntos del usuario
 */
export interface UserPointsBalance {
  user_id: string
  balance: number
  total_earned: number
  total_spent: number
  created_at: string
  updated_at: string
}

/**
 * Transacción de puntos
 */
export interface PointsTransaction {
  id: string
  user_id: string
  amount: number
  type: 'earned' | 'spent' | 'refund' | 'adjustment'
  description: string
  order_id?: number
  created_at: string
  metadata?: Record<string, any>
}

/**
 * Puntos asociados a una orden
 */
export interface OrderPoints {
  id: string
  order_id: number
  user_id: string
  points_used: number
  points_earned: number
  discount_amount: number
  created_at: string
}

/**
 * Obtener balance de puntos de un usuario
 */
export async function getUserPointsBalance(userId: string): Promise<UserPointsBalance | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('user_points')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error) {
      // Si no existe, crear balance inicial
      if (error.code === 'PGRST116') {
        const { data: newBalance, error: createError } = await supabaseAdmin
          .from('user_points')
          .insert({
            user_id: userId,
            balance: 0,
            total_earned: 0,
            total_spent: 0
          })
          .select()
          .single()

        if (createError) {
          logger.error({ error: createError, userId }, 'Error creating initial points balance')
          return null
        }

        return newBalance
      }

      logger.error({ error, userId }, 'Error fetching user points balance')
      return null
    }

    return data
  } catch (error) {
    logger.error({ error, userId }, 'Exception fetching user points balance')
    return null
  }
}

/**
 * Calcular puntos ganados por una compra
 * Regla: total_compra / 400
 */
export function calculateEarnedPoints(purchaseAmount: number): number {
  return Math.floor(purchaseAmount / POINTS_CONSTANTS.EARNING_DIVISOR)
}

/**
 * Convertir puntos a pesos
 * Regla: 100 puntos = $1,000 COP
 */
export function pointsToPesos(points: number): number {
  return points * POINTS_CONSTANTS.PESOS_PER_POINT
}

/**
 * Convertir pesos a puntos
 * Regla: $1,000 COP = 100 puntos
 */
export function pesosToPoints(amount: number): number {
  return Math.floor(amount / POINTS_CONSTANTS.PESOS_PER_POINT)
}

/**
 * Agregar puntos a un usuario
 */
export async function addPoints(
  userId: string,
  amount: number,
  type: 'earned' | 'refund' | 'adjustment',
  description: string,
  orderId?: number,
  metadata?: Record<string, any>
): Promise<boolean> {
  try {
    // 1. Obtener o crear balance actual
    let balance = await getUserPointsBalance(userId)
    if (!balance) {
      logger.error({ userId }, 'Could not get or create user points balance')
      return false
    }

    // 2. Actualizar balance
    const newBalance = balance.balance + amount
    const newTotalEarned = balance.total_earned + amount

    const { error: updateError } = await supabaseAdmin
      .from('user_points')
      .update({
        balance: newBalance,
        total_earned: newTotalEarned,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)

    if (updateError) {
      logger.error({ error: updateError, userId }, 'Error updating points balance')
      return false
    }

    // 3. Registrar transacción
    const { error: transactionError } = await supabaseAdmin
      .from('points_transactions')
      .insert({
        user_id: userId,
        amount,
        type,
        description,
        order_id: orderId,
        metadata: metadata || {}
      })

    if (transactionError) {
      logger.error({ error: transactionError, userId }, 'Error recording points transaction')
      // No revertir el balance, solo loguear el error
    }

    logger.info({
      userId,
      amount,
      type,
      newBalance
    }, 'Points added successfully')

    return true
  } catch (error) {
    logger.error({ error, userId, amount }, 'Exception adding points')
    return false
  }
}

/**
 * Deducir puntos de un usuario
 */
export async function deductPoints(
  userId: string,
  amount: number,
  description: string,
  orderId?: number,
  metadata?: Record<string, any>
): Promise<boolean> {
  try {
    // 1. Obtener balance actual
    const balance = await getUserPointsBalance(userId)
    if (!balance) {
      logger.error({ userId }, 'User points balance not found')
      return false
    }

    // 2. Verificar que tenga suficientes puntos
    if (balance.balance < amount) {
      logger.warn({
        userId,
        requested: amount,
        available: balance.balance
      }, 'Insufficient points balance')
      return false
    }

    // 3. Actualizar balance
    const newBalance = balance.balance - amount
    const newTotalSpent = balance.total_spent + amount

    await supabaseAdmin
      .from('user_points')
      .update({
        balance: newBalance,
        total_spent: newTotalSpent,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)

    // 4. Registrar transacción (negativo para gastos)
    await supabaseAdmin
      .from('points_transactions')
      .insert({
        user_id: userId,
        amount: -amount, // Negativo para indicar gasto
        type: 'spent',
        description,
        order_id: orderId,
        metadata: metadata || {}
      })

    logger.info({
      userId,
      amount,
      newBalance
    }, 'Points deducted successfully')

    return true
  } catch (error) {
    console.log(error)
    logger.error({ error, userId, amount }, 'Exception deducting points')
    return false
  }
}

/**
 * Obtener historial de transacciones de puntos
 */
export async function getPointsTransactions(
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<PointsTransaction[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('points_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      logger.error({ error, userId }, 'Error fetching points transactions')
      return []
    }

    return data || []
  } catch (error) {
    logger.error({ error, userId }, 'Exception fetching points transactions')
    return []
  }
}

/**
 * Registrar puntos usados y ganados en una orden
 */
export async function recordOrderPoints(
  orderId: number,
  userId: string,
  pointsUsed: number,
  pointsEarned: number,
  discountAmount: number
): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from('order_points')
      .insert({
        order_id: orderId,
        user_id: userId,
        points_used: pointsUsed,
        points_earned: pointsEarned,
        discount_amount: discountAmount
      })

    if (error) {
      logger.error({ error, orderId, userId }, 'Error recording order points')
      return false
    }

    logger.info({
      orderId,
      userId,
      pointsUsed,
      pointsEarned,
      discountAmount
    }, 'Order points recorded successfully')

    return true
  } catch (error) {
    logger.error({ error, orderId, userId }, 'Exception recording order points')
    return false
  }
}

/**
 * Obtener puntos asociados a una orden
 */
export async function getOrderPoints(orderId: number): Promise<OrderPoints | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('order_points')
      .select('*')
      .eq('order_id', orderId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // No existe registro
      }
      logger.error({ error, orderId }, 'Error fetching order points')
      return null
    }

    return data
  } catch (error) {
    logger.error({ error, orderId }, 'Exception fetching order points')
    return null
  }
}

/**
 * Calcular reembolso proporcional de puntos y dinero
 * 
 * Lógica correcta:
 * 1. Total orden = precio antes de aplicar descuento de puntos
 * 2. Descuento por puntos = pointsUsed × 10 COP
 * 3. Realmente pagado = Total orden - Descuento por puntos
 * 4. Porcentaje de devolución = refundAmount / realmentePagado
 * 5. Puntos a reembolsar = Math.floor((refundAmount / realmentePagado) × pointsUsed)
 * 
 * Ejemplo:
 * - Orden: $766,000
 * - Puntos usados: 717 puntos = $7,170 descuento
 * - Realmente pagado: $758,830
 * - Devolución: $315,000
 * - Porcentaje: 41.50%
 * - Puntos a reembolsar: Math.floor(31,500 × 41.50%) = 298 puntos
 * 
 * @param orderTotal - Total original de la orden (antes del descuento de puntos)
 * @param pointsUsed - Puntos que se usaron en la orden
 * @param refundAmount - Monto total a reembolsar
 * @returns Objeto con dinero y puntos a reembolsar
 */
export function calculateProportionalRefund(
  orderTotal: number,
  pointsUsed: number,
  refundAmount: number
): { moneyRefund: number; pointsRefund: number } {
  if (orderTotal <= 0) {
    return { moneyRefund: 0, pointsRefund: 0 }
  }

  // 1. Calcular el valor en pesos del descuento por puntos y lo que se pagó con dinero
  const pointsDiscount = pointsToPesos(pointsUsed)
  const moneyPaid = orderTotal - pointsDiscount

  // Si el pago con dinero es negativo o cero, todo se pagó con puntos
  if (moneyPaid <= 0) {
    return {
      moneyRefund: 0,
      pointsRefund: pesosToPoints(refundAmount)
    }
  }

  // 2. Calcular la proporción del pago que se hizo con dinero y con puntos
  const moneyProportion = moneyPaid / orderTotal
  const pointsProportion = pointsDiscount / orderTotal

  // 3. Calcular el reembolso para cada parte basado en su proporción
  const moneyRefund = Math.round(refundAmount * moneyProportion)
  const pointsValueToRefund = refundAmount * pointsProportion
  const pointsRefund = pesosToPoints(pointsValueToRefund)

  return {
    moneyRefund,
    pointsRefund: Math.round(pointsRefund)
  }
}

export default {
  getUserPointsBalance,
  calculateEarnedPoints,
  pointsToPesos,
  pesosToPoints,
  addPoints,
  deductPoints,
  getPointsTransactions,
  recordOrderPoints,
  getOrderPoints,
  calculateProportionalRefund,
  POINTS_CONSTANTS
}
