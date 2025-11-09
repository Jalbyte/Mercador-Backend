/**
 * Tests para el servicio de puntos
 * Valida cálculos, conversiones, y lógica de reembolsos proporcionales
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  calculateEarnedPoints,
  pointsToPesos,
  pesosToPoints,
  calculateProportionalRefund,
  POINTS_CONSTANTS
} from '../../services/points.service.js'

describe('Points Service', () => {
  describe('calculateEarnedPoints', () => {
    it('should calculate earned points correctly for typical purchase', () => {
      // 100,000 / 400 = 250 points
      expect(calculateEarnedPoints(100000)).toBe(250)
    })

    it('should calculate earned points for small purchase', () => {
      // 1,000 / 400 = 2.5 -> 2 points (floor)
      expect(calculateEarnedPoints(1000)).toBe(2)
    })

    it('should calculate earned points for large purchase', () => {
      // 1,000,000 / 400 = 2,500 points
      expect(calculateEarnedPoints(1000000)).toBe(2500)
    })

    it('should return 0 points for amount less than earning divisor', () => {
      expect(calculateEarnedPoints(399)).toBe(0)
    })

    it('should return 0 points for zero amount', () => {
      expect(calculateEarnedPoints(0)).toBe(0)
    })

    it('should handle fractional amounts correctly (floor)', () => {
      // 999 / 400 = 2.4975 -> 2 points
      expect(calculateEarnedPoints(999)).toBe(2)
    })
  })

  describe('pointsToPesos', () => {
    it('should convert points to pesos correctly', () => {
      // 100 points * 10 = 1,000 pesos
      expect(pointsToPesos(100)).toBe(1000)
    })

    it('should convert large amount of points', () => {
      // 10,000 points * 10 = 100,000 pesos
      expect(pointsToPesos(10000)).toBe(100000)
    })

    it('should return 0 for 0 points', () => {
      expect(pointsToPesos(0)).toBe(0)
    })

    it('should handle single point', () => {
      expect(pointsToPesos(1)).toBe(10)
    })
  })

  describe('pesosToPoints', () => {
    it('should convert pesos to points correctly', () => {
      // 1,000 pesos / 10 = 100 points
      expect(pesosToPoints(1000)).toBe(100)
    })

    it('should convert large amount of pesos', () => {
      // 100,000 pesos / 10 = 10,000 points
      expect(pesosToPoints(100000)).toBe(10000)
    })

    it('should return 0 for 0 pesos', () => {
      expect(pesosToPoints(0)).toBe(0)
    })

    it('should handle fractional pesos (floor)', () => {
      // 99 pesos / 10 = 9.9 -> 9 points
      expect(pesosToPoints(99)).toBe(9)
    })
  })

  describe('calculateProportionalRefund', () => {
    it('should calculate 100% money refund when no points used', () => {
      const result = calculateProportionalRefund(100000, 0, 100000)

      expect(result.moneyRefund).toBe(100000)
      expect(result.pointsRefund).toBe(0)
    })

    it('should calculate 100% points refund when only points used', () => {
      // Order paid 100% with points: 10,000 points = 100,000 pesos discount
      const result = calculateProportionalRefund(100000, 10000, 100000)

      expect(result.moneyRefund).toBe(0)
      expect(result.pointsRefund).toBe(10000)
    })

    it('should calculate 50/50 split refund', () => {
      // Order: 100,000 total, used 5,000 points (50,000 value)
      // Paid: 50,000 money + 50,000 points
      // Refund 100,000: should be 50,000 money + 5,000 points
      const result = calculateProportionalRefund(100000, 5000, 100000)

      expect(result.moneyRefund).toBe(50000)
      expect(result.pointsRefund).toBe(5000)
    })

    it('should calculate 75/25 split (75% money, 25% points)', () => {
      // Order: 100,000 total, used 2,500 points (25,000 value)
      // Paid: 75,000 money + 25,000 points
      // Refund 100,000: should be 75,000 money + 2,500 points
      const result = calculateProportionalRefund(100000, 2500, 100000)

      expect(result.moneyRefund).toBe(75000)
      expect(result.pointsRefund).toBe(2500)
    })

    it('should calculate 25/75 split (25% money, 75% points)', () => {
      // Order: 100,000 total, used 7,500 points (75,000 value)
      // Paid: 25,000 money + 75,000 points
      // Refund 100,000: should be 25,000 money + 7,500 points
      const result = calculateProportionalRefund(100000, 7500, 100000)

      expect(result.moneyRefund).toBe(25000)
      expect(result.pointsRefund).toBe(7500)
    })

    it('should handle partial refund with 50/50 split', () => {
      // Order: 100,000 total, used 5,000 points (50,000 value)
      // Paid: 50,000 money + 50,000 points
      // Refund only 40,000: should be 20,000 money + 2,000 points
      const result = calculateProportionalRefund(100000, 5000, 40000)

      expect(result.moneyRefund).toBe(20000)
      expect(result.pointsRefund).toBe(2000)
    })

    it('should handle small refund amounts', () => {
      // Order: 10,000 total, used 500 points (5,000 value)
      // Paid: 5,000 money + 5,000 points
      // Refund 1,000: should be 500 money + 50 points
      const result = calculateProportionalRefund(10000, 500, 1000)

      expect(result.moneyRefund).toBe(500)
      expect(result.pointsRefund).toBe(50)
    })

    it('should handle edge case with 1 point used', () => {
      // Order: 10,000 total, used 1 point (10 pesos value)
      // Paid: 9,990 money + 10 points
      // Refund 10,000
      const result = calculateProportionalRefund(10000, 1, 10000)

      expect(result.moneyRefund).toBe(9990)
      expect(result.pointsRefund).toBe(1)
    })

    it('should handle rounding correctly for odd numbers', () => {
      // Order: 99,999 total, used 3,333 points (33,330 value)
      // Paid: 66,669 money + 33,330 points
      // Refund 50,000
      const result = calculateProportionalRefund(99999, 3333, 50000)

      // money: 50000 * (66669/99999) ≈ 33,335
      // points value: 50000 * (33330/99999) ≈ 16,665
      // points: 16665 / 10 ≈ 1,666
      expect(result.moneyRefund).toBeGreaterThan(33000)
      expect(result.moneyRefund).toBeLessThan(34000)
      expect(result.pointsRefund).toBeGreaterThan(1600)
      expect(result.pointsRefund).toBeLessThan(1700)
    })

    it('should return 0 refund for 0 amount', () => {
      const result = calculateProportionalRefund(100000, 5000, 0)

      expect(result.moneyRefund).toBe(0)
      expect(result.pointsRefund).toBe(0)
    })
  })

  describe('Edge Cases and Validations', () => {
    it('should handle negative amounts gracefully in calculateEarnedPoints', () => {
      // Floor of negative division still gives negative result
      // The service doesn't explicitly guard against negatives
      const result = calculateEarnedPoints(-1000)
      expect(result).toBeLessThan(0) // Will be -2 or -3
    })

    it('should maintain precision in conversion chain', () => {
      // Convert 1000 pesos -> points -> pesos
      const points = pesosToPoints(1000)
      const pesosBack = pointsToPesos(points)
      expect(pesosBack).toBe(1000)
    })

    it('should validate POINTS_CONSTANTS values', () => {
      expect(POINTS_CONSTANTS.POINTS_PER_1000_PESOS).toBe(100)
      expect(POINTS_CONSTANTS.PESOS_PER_POINT).toBe(10)
      expect(POINTS_CONSTANTS.EARNING_DIVISOR).toBe(400)
    })

    it('should calculate consistent refunds regardless of order', () => {
      // Same refund amount should give consistent results
      const result1 = calculateProportionalRefund(100000, 5000, 50000)
      const result2 = calculateProportionalRefund(100000, 5000, 50000)

      expect(result1.moneyRefund).toBe(result2.moneyRefund)
      expect(result1.pointsRefund).toBe(result2.pointsRefund)
    })

    it('should handle maximum safe integer', () => {
      const largeAmount = 9007199254740991 // Number.MAX_SAFE_INTEGER
      const earned = calculateEarnedPoints(largeAmount)
      expect(earned).toBeGreaterThan(0)
      expect(Number.isInteger(earned)).toBe(true)
    })
  })

  describe('Real-world Scenarios', () => {
    it('should simulate complete purchase and return flow', () => {
      // Scenario: User buys $100,000 worth, earns points, uses some points in next purchase, then returns
      
      // 1. First purchase: $100,000, no points used
      const firstPurchase = 100000
      const earnedFromFirst = calculateEarnedPoints(firstPurchase)
      expect(earnedFromFirst).toBe(250) // 100,000 / 400

      // 2. Second purchase: $80,000, uses 200 points ($2,000 discount)
      const secondPurchaseBase = 80000
      const pointsUsed = 200
      const discount = pointsToPesos(pointsUsed)
      expect(discount).toBe(2000)
      const actualPayment = secondPurchaseBase - discount // $78,000 actual payment
      expect(actualPayment).toBe(78000)

      // 3. Returns second purchase completely
      const refund = calculateProportionalRefund(secondPurchaseBase, pointsUsed, secondPurchaseBase)
      expect(refund.moneyRefund).toBe(78000) // Should get back the $78,000 paid
      expect(refund.pointsRefund).toBe(200) // Should get back 200 points
    })

    it('should handle multi-item partial return scenario', () => {
      // Order: 3 items totaling $150,000, used 1,000 points ($10,000 value)
      // Returning 2 items worth $100,000
      const totalOrder = 150000
      const pointsUsed = 1000
      const returnAmount = 100000

      const refund = calculateProportionalRefund(totalOrder, pointsUsed, returnAmount)

      // Payment was: $140,000 money + $10,000 points value
      // Ratio: 140k/150k = 93.33% money, 10k/150k = 6.67% points
      // Returning 100k: should be 93,333 money + 666 points
      expect(refund.moneyRefund).toBeGreaterThan(93000)
      expect(refund.moneyRefund).toBeLessThan(94000)
      expect(refund.pointsRefund).toBeGreaterThan(660)
      expect(refund.pointsRefund).toBeLessThan(670)
    })
  })
})
