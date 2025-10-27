/**
 * Redis client mocks for testing
 */
import { vi } from 'vitest'

const mockRedisData = new Map<string, { value: string; expiry?: number }>()

export const mockRedisClient = {
  get: vi.fn(async (key: string) => {
    const item = mockRedisData.get(key)
    if (!item) return null
    if (item.expiry && item.expiry < Date.now()) {
      mockRedisData.delete(key)
      return null
    }
    return item.value
  }),
  
  set: vi.fn(async (key: string, value: string, options?: { EX?: number }) => {
    const expiry = options?.EX ? Date.now() + options.EX * 1000 : undefined
    mockRedisData.set(key, { value, expiry })
    return 'OK'
  }),
  
  setEx: vi.fn(async (key: string, seconds: number, value: string) => {
    const expiry = Date.now() + seconds * 1000
    mockRedisData.set(key, { value, expiry })
    return 'OK'
  }),
  
  del: vi.fn(async (key: string) => {
    mockRedisData.delete(key)
    return 1
  }),
  
  exists: vi.fn(async (key: string) => {
    return mockRedisData.has(key) ? 1 : 0
  }),
  
  expire: vi.fn(async (key: string, seconds: number) => {
    const item = mockRedisData.get(key)
    if (!item) return 0
    item.expiry = Date.now() + seconds * 1000
    return 1
  }),
  
  ttl: vi.fn(async (key: string) => {
    const item = mockRedisData.get(key)
    if (!item) return -2
    if (!item.expiry) return -1
    const ttl = Math.ceil((item.expiry - Date.now()) / 1000)
    return ttl > 0 ? ttl : -2
  }),
  
  keys: vi.fn(async (pattern: string) => {
    return Array.from(mockRedisData.keys()).filter((key) =>
      key.includes(pattern.replace('*', ''))
    )
  }),
  
  flushAll: vi.fn(async () => {
    mockRedisData.clear()
    return 'OK'
  }),
  
  connect: vi.fn(async () => undefined),
  disconnect: vi.fn(async () => undefined),
  quit: vi.fn(async () => 'OK'),
  isOpen: true,
  isReady: true,
}

// Helper to clear mock data between tests
export const clearMockRedis = () => {
  mockRedisData.clear()
  vi.clearAllMocks()
}

// Mock Redis module
vi.mock('redis', () => ({
  createClient: vi.fn(() => mockRedisClient),
}))
