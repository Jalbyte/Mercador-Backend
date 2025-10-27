/**
 * Wompi API mocks for testing
 */
import { vi } from 'vitest'

export const mockWompiTransaction = {
  id: '11984559-1761111547-48917',
  reference: 'ORDER-123',
  amount_in_cents: 10400000,
  currency: 'COP',
  status: 'APPROVED',
  payment_method_type: 'PSE',
  payment_method: {
    type: 'PSE',
    extra: {
      bank_name: 'Banco de Prueba',
      async_payment_url: 'https://sandbox.wompi.co/...',
    },
  },
  customer_email: 'test@example.com',
  created_at: new Date().toISOString(),
  finalized_at: new Date().toISOString(),
}

export const mockWompiWebhookEvent = {
  event: 'transaction.updated',
  data: {
    transaction: mockWompiTransaction,
  },
  signature: {
    checksum: '0ef4b22037fb806aa5e76baef98c12dc04164e04a531b1faa2da1ff92c00d533',
    properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'],
  },
  timestamp: Date.now(),
}

export const mockWompiAcceptanceToken = {
  data: {
    id: 12345,
    public_key: 'pub_test_xxxxx',
    type: 'END_USER_POLICY',
    permalink: 'https://wompi.com/acceptance-token',
    status: 'ACTIVE',
  },
}

export const mockAxiosWompiClient = {
  get: vi.fn().mockImplementation((url: string) => {
    if (url.includes('/merchants/')) {
      return Promise.resolve({
        data: mockWompiAcceptanceToken,
        status: 200,
      })
    }
    if (url.includes('/transactions/')) {
      return Promise.resolve({
        data: { data: mockWompiTransaction },
        status: 200,
      })
    }
    return Promise.reject(new Error('Not found'))
  }),
  
  post: vi.fn().mockImplementation((url: string, data: any) => {
    if (url.includes('/transactions')) {
      return Promise.resolve({
        data: {
          data: {
            ...mockWompiTransaction,
            reference: data.reference,
            amount_in_cents: data.amount_in_cents,
            status: 'PENDING',
          },
        },
        status: 201,
      })
    }
    return Promise.reject(new Error('Not found'))
  }),
}

// Mock axios for Wompi API calls
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => mockAxiosWompiClient),
    get: mockAxiosWompiClient.get,
    post: mockAxiosWompiClient.post,
  },
}))
