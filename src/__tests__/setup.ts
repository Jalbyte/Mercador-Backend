/**
 * Test setup file - runs before all tests
 */
import { vi } from 'vitest'
import dotenv from 'dotenv'

// Load test environment variables
dotenv.config({ path: '.env.test' })

// Mock environment variables for tests
process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co'
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key'
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
process.env.WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY || 'pub_test_xxxxx'
process.env.WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY || 'prv_test_xxxxx'
process.env.WOMPI_EVENTS_SECRET = process.env.WOMPI_EVENTS_SECRET || 'test_integrity_xxxxx'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key'
process.env.APP_REDIRECT_URL = process.env.APP_REDIRECT_URL || 'http://localhost:3000'

// Set up global test timeout
vi.setConfig({ testTimeout: 10000 })

// Mock console methods to reduce noise in tests (optional)
global.console = {
  ...console,
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  // Keep error for debugging
  error: console.error,
}

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks()
})
