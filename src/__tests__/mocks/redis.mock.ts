import { vi } from 'vitest'

// In-memory store for Redis mock
const mockStore = new Map()

// Mock Redis client with event emitter support
export const mockRedisClient = {
  // Event emitter methods (must return 'mockRedisClient' for chaining)
  on: vi.fn(function(event, handler) { return mockRedisClient }),
  once: vi.fn(function(event, handler) { return mockRedisClient }),
  off: vi.fn(function(event, handler) { return mockRedisClient }),
  emit: vi.fn((event, ...args) => true),
  removeListener: vi.fn(function(event, handler) { return mockRedisClient }),
  removeAllListeners: vi.fn(function(event) { return mockRedisClient }),
  
  // Connection methods
  connect: vi.fn().mockResolvedValue(undefined),
  quit: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  isOpen: true,
  isReady: true,
  
  // Redis operations
  get: vi.fn((key) => Promise.resolve(mockStore.get(key) ?? null)),
  set: vi.fn((key, value, options) => {
    mockStore.set(key, value)
    return Promise.resolve('OK')
  }),
  del: vi.fn((key) => {
    const existed = mockStore.has(key)
    mockStore.delete(key)
    return Promise.resolve(existed ? 1 : 0)
  }),
  exists: vi.fn((key) => Promise.resolve(mockStore.has(key) ? 1 : 0)),
  expire: vi.fn().mockResolvedValue(1),
  ttl: vi.fn().mockResolvedValue(-1),
  keys: vi.fn((pattern) => Promise.resolve(Array.from(mockStore.keys()))),
  flushAll: vi.fn(() => {
    mockStore.clear()
    return Promise.resolve('OK')
  }),
  
  // Additional Redis commands
  incr: vi.fn((key) => {
    const current = parseInt(mockStore.get(key) || '0', 10)
    const newVal = current + 1
    mockStore.set(key, String(newVal))
    return Promise.resolve(newVal)
  }),
  decr: vi.fn((key) => {
    const current = parseInt(mockStore.get(key) || '0', 10)
    const newVal = current - 1
    mockStore.set(key, String(newVal))
    return Promise.resolve(newVal)
  }),
  
  // Pub/Sub
  publish: vi.fn().mockResolvedValue(0),
  subscribe: vi.fn().mockResolvedValue(undefined),
  unsubscribe: vi.fn().mockResolvedValue(undefined),
}

// Helper to clear the mock store
export function clearMockRedis() {
  mockStore.clear()
  // Reset all mock function call history
  Object.values(mockRedisClient).forEach(value => {
    if (typeof value === 'function' && 'mockClear' in value) {
      value.mockClear()
    }
  })
}

// Mock the redis module - mockRedisClient must happen at module scope
vi.mock('redis', () => ({
  createClient: vi.fn(() => mockRedisClient),
}))

// Mock the Upstash Redis module (if used)
vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    get: vi.fn((key) => Promise.resolve(mockStore.get(key) ?? null)),
    set: vi.fn((key, value, options) => {
      mockStore.set(key, value)
      return Promise.resolve('OK')
    }),
    del: vi.fn((key) => {
      const existed = mockStore.has(key)
      mockStore.delete(key)
      return Promise.resolve(existed ? 1 : 0)
    }),
    exists: vi.fn((key) => Promise.resolve(mockStore.has(key) ? 1 : 0)),
  })),
}))

export default mockRedisClient