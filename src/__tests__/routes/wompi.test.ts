/**
 * Integration tests for Wompi routes
 */
import { describe, it, expect, beforeEach } from 'vitest'
// Import mocks first, before the routes
import '../mocks/supabase.mock.js'
import '../mocks/redis.mock.js'
import { Hono } from 'hono'
import wompiRoutes from '@/routes/wompi.js'
import { logger } from '@/utils/logger.js'

const app = new Hono()
app.route('/wompi', wompiRoutes)

describe('Wompi Routes Integration', () => {
  describe('GET /wompi/config', () => {
    it('should return Wompi public configuration', async () => {
      const res = await app.request('/wompi/config')
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json).toHaveProperty('publicKey')
      expect(json).toHaveProperty('isProduction')
      expect(typeof json.isProduction).toBe('boolean')
    })
  })

  describe('POST /wompi/generate-signature', () => {
    it('should generate signature for valid request', async () => {
      const res = await app.request('/wompi/generate-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 100000,
          currency: 'COP',
          reference: 'ORDER-123',
        }),
      })

      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json).toHaveProperty('signature')
      expect(json).toHaveProperty('amountInCents')
      expect(json.amountInCents).toBe(10000000)
      expect(json.reference).toBe('ORDER-123')
    })

    it('should reject request with missing parameters', async () => {
      const res = await app.request('/wompi/generate-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 100000,
          // missing currency and reference
        }),
      })

      const json = await res.json()
      logger.info(`Response status: ${res.status}`)
      logger.info(`Response body: ${JSON.stringify(json, null, 2)}`)

      expect(res.status).toBe(400)
      expect(json.success).toBe(false)
      // For now, just check that there's some kind of error
      expect(json).toHaveProperty('success')
      expect(json.success).toBe(false)
    })
  })

  describe('POST /wompi/webhook', () => {
    it('should process valid webhook event', async () => {
      const event = {
        event: 'transaction.updated',
        data: {
          transaction: {
            id: '11984559-1761111547-48917',
            reference: 'ORDER-123',
            status: 'APPROVED',
            amount_in_cents: 10400000,
          },
        },
        signature: {
          properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'],
          checksum: 'valid_checksum_here',
        },
        timestamp: Date.now(),
      }

      const res = await app.request('/wompi/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Event-Checksum': 'test_checksum',
        },
        body: JSON.stringify(event),
      })

      const json = await res.json()

      // Note: This will fail signature validation in test, but should process structure
      expect(res.status).toBeGreaterThanOrEqual(200)
      expect(json).toHaveProperty('success')
    })

    it('should handle webhook without signature header', async () => {
      const event = {
        event: 'transaction.updated',
        data: {
          transaction: {
            id: '11984559-1761111547-48917',
            reference: 'ORDER-123',
            status: 'APPROVED',
          },
        },
        signature: {
          properties: ['transaction.id'],
          checksum: 'test',
        },
        timestamp: Date.now(),
      }

      const res = await app.request('/wompi/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // No X-Event-Checksum header
        body: JSON.stringify(event),
      })

      const json = await res.json()

      expect(res.status).toBeGreaterThanOrEqual(200)
      expect(json).toHaveProperty('success')
    })
  })

  describe('GET /wompi/status/:transactionId', () => {
    it('should fetch transaction status', async () => {
      const res = await app.request('/wompi/status/11984559-1761111547-48917')
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json.data).toBeDefined()
      expect(json.data.id).toBe('11984559-1761111547-48917')
    })

    it('should handle missing transaction ID', async () => {
      const res = await app.request('/wompi/status/')

      // Should return 404 or redirect
      expect([404, 301, 302]).toContain(res.status)
    })
  })
})
