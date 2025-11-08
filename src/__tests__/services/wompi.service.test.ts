/**
 * Tests for Wompi Service
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
// Import mocks first, before the service
import '../mocks/supabase.mock.js'
import '../mocks/redis.mock.js'
import { WompiService } from '../../services/wompi.service.js'
import crypto from 'crypto'

// Mock environment variables
const MOCK_ENV = {
  WOMPI_PUBLIC_KEY: 'pub_test_xxxxx',
  WOMPI_PRIVATE_KEY: 'prv_test_xxxxx',
  WOMPI_EVENTS_SECRET: 'test_integrity_da6xTSFwIjmkBcbaEajluAEHar7jvewT',
}

// Mock order service para evitar errores en updateOrderStatusWithPayment
vi.mock('../../services/order.service.js', () => ({
  updateOrderStatusWithPayment: vi.fn(async (orderId, status) => ({
    id: orderId,
    status,
    updated_at: new Date().toISOString()
  })),
  getOrderUserId: vi.fn(async (orderId) => 'test-user-id')
}))

describe('WompiService', () => {
  let wompiService: WompiService

  beforeEach(() => {
    // Reset environment variables
    process.env.WOMPI_PUBLIC_KEY = MOCK_ENV.WOMPI_PUBLIC_KEY
    process.env.WOMPI_PRIVATE_KEY = MOCK_ENV.WOMPI_PRIVATE_KEY
    process.env.WOMPI_EVENTS_SECRET = MOCK_ENV.WOMPI_EVENTS_SECRET

    wompiService = new WompiService()
    vi.clearAllMocks()
  })

  // ====================== generateIntegritySignature ======================
  describe('generateIntegritySignature', () => {
    it('should generate correct signature for Widget', () => {
      const reference = 'ORDER-123'
      const amountInCents = 10000000 // $100,000 COP
      const currency = 'COP'

      const signature = wompiService.generateIntegritySignature(
        reference,
        amountInCents,
        currency
      )

      // Verify signature format (SHA256 hex)
      expect(signature).toMatch(/^[a-f0-9]{64}$/)

      // Verify signature calculation
      const expectedData = `${reference}${amountInCents}${currency}${MOCK_ENV.WOMPI_EVENTS_SECRET}`
      const expectedSignature = crypto
        .createHash('sha256')
        .update(expectedData)
        .digest('hex')

      expect(signature).toBe(expectedSignature)
    })

    it('should generate different signatures for different amounts', () => {
      const reference = 'ORDER-123'
      const currency = 'COP'

      const signature1 = wompiService.generateIntegritySignature(reference, 10000000, currency)
      const signature2 = wompiService.generateIntegritySignature(reference, 20000000, currency)

      expect(signature1).not.toBe(signature2)
    })

    it('should generate different signatures for different references', () => {
      const amountInCents = 10000000
      const currency = 'COP'

      const signature1 = wompiService.generateIntegritySignature('ORDER-1', amountInCents, currency)
      const signature2 = wompiService.generateIntegritySignature('ORDER-2', amountInCents, currency)

      expect(signature1).not.toBe(signature2)
    })
  })

  // ====================== validateWebhookSignature ======================
  describe('validateWebhookSignature', () => {
    it('should validate correct webhook signature', () => {
      const event = {
        event: 'transaction.updated',
        data: {
          transaction: {
            id: '11984559-1761111547-48917',
            status: 'APPROVED',
            amount_in_cents: 10400000,
            reference: 'ORDER-123',
            customer_email: 'test@example.com',
            currency: 'COP',
            payment_method_type: 'PSE',
            redirect_url: 'https://example.com/callback',
            created_at: new Date().toISOString(),
          },
        },
        signature: {
          properties: ['data.transaction.amount_in_cents', 'data.transaction.id', 'data.transaction.status'],
          checksum: '', // Will be calculated
        },
        timestamp: Date.now(),
        sent_at: new Date().toISOString(),
      }

      // Calculate correct checksum
      const concatenated = '10400000' + '11984559-1761111547-48917' + 'APPROVED'
      const checksum = crypto
        .createHash('sha256')
        .update(concatenated + MOCK_ENV.WOMPI_EVENTS_SECRET)
        .digest('hex')

      event.signature.checksum = checksum

      const isValid = wompiService.validateWebhookSignature(event)
      expect(isValid).toBe(true)
    })

    it('should return false for invalid checksum', () => {
      const event = {
        event: 'transaction.updated',
        data: {
          transaction: {
            id: '11984559-17u61111547-48917',
            status: 'APPROVED',
            amount_in_cents: 10400000,
            reference: 'ORDER-123',
            customer_email: 'test@example.com',
            currency: 'COP',
            payment_method_type: 'PSE',
            redirect_url: 'https://example.com/callback',
            created_at: new Date().toISOString(),
          },
        },
        signature: {
          properties: ['transaction.id', 'transaction.status', 'data.transaction.amount_in_cents'],
          checksum: 'invalid_checksum_123456',
        },
        timestamp: Date.now(),
        sent_at: new Date().toISOString(),
      }

      const isValid = wompiService.validateWebhookSignature(event)
      expect(isValid).toBe(false)
    })

    it('should handle missing signature gracefully', () => {
      const event = {
        event: 'transaction.updated',
        data: {
          transaction: {
            id: '11984559-1761111547-48917',
            status: 'APPROVED',
          },
        },
        timestamp: Date.now(),
      } as any

      const isValid = wompiService.validateWebhookSignature(event)
      expect(isValid).toBe(false)
    })

    it('should handle missing properties gracefully', () => {
      const event = {
        event: 'transaction.updated',
        data: {
          transaction: {
            id: '11984559-1761111547-48917',
          },
        },
        signature: {
          properties: ['transaction.id', 'transaction.status', 'transaction.missing_field'],
          checksum: 'some_checksum',
        },
        timestamp: Date.now(),
        sent_at: new Date().toISOString(),
      } as any

      const isValid = wompiService.validateWebhookSignature(event)
      expect(isValid).toBe(false)
    })
  })

  // ====================== processWebhookEvent ======================
  describe('processWebhookEvent', () => {
    it('should process APPROVED transaction', async () => {
      const event = {
        event: 'transaction.updated',
        data: {
          transaction: {
            id: '11984559-1761111547-48917',
            reference: 'ORDER-123',
            status: 'APPROVED',
            amount_in_cents: 10400000,
            customer_email: 'test@example.com',
            currency: 'COP',
            payment_method_type: 'PSE',
            redirect_url: 'https://example.com/callback',
            created_at: new Date().toISOString(),
          },
        },
        signature: {
          properties: ['transaction.id', 'transaction.status'],
          checksum: 'valid',
        },
        timestamp: Date.now(),
        sent_at: new Date().toISOString(),
      }

      const result = await wompiService.processWebhookEvent(event)

      expect(result.success).toBe(true)
      expect(result.message).toContain('ORDER-123')
      expect(result.message).toContain('APPROVED')
    })

    it('should process DECLINED transaction', async () => {
      const event = {
        event: 'transaction.updated',
        data: {
          transaction: {
            id: '11984559-1761111547-48917',
            reference: 'ORDER-123',
            status: 'DECLINED',
            amount_in_cents: 10400000,
            customer_email: 'test@example.com',
            currency: 'COP',
            payment_method_type: 'PSE',
            redirect_url: 'https://example.com/callback',
            created_at: new Date().toISOString(),
          },
        },
        signature: {
          properties: ['transaction.id'],
          checksum: 'valid',
        },
        timestamp: Date.now(),
        sent_at: new Date().toISOString(),
      }

      const result = await wompiService.processWebhookEvent(event)

      expect(result.success).toBe(true)
      expect(result.message).toContain('DECLINED')
    })

    it('should handle missing transaction data', async () => {
      const event = {
        event: 'transaction.updated',
        data: {},
        signature: {
          properties: [],
          checksum: 'valid',
        },
        timestamp: Date.now(),
      } as any

      const result = await wompiService.processWebhookEvent(event)

      expect(result.success).toBe(false)
      expect(result.message).toContain('datos')
    })
  })

  // ====================== getTransactionStatusPublic ======================
  describe('getTransactionStatusPublic', () => {
    it('should fetch transaction status from public API', async () => {
      const transactionId = '11984559-1761111547-48917'

      const result = await wompiService.getTransactionStatusPublic(transactionId)

      expect(result.data).toBeDefined()
      expect(result.data.id).toBe(transactionId)
    })
  })
})
