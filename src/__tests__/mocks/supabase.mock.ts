/**
 * Supabase client mocks for testing
 */
import { vi } from 'vitest'

export const mockSupabaseUser = {
  id: 'test-user-id-123',
  email: 'test@example.com',
  user_metadata: {
    full_name: 'Test User',
    country: 'CO',
    role: 'cliente',
  },
  created_at: new Date().toISOString(),
}

// Helper para crear un JWT de prueba válido
function createMockJWT(userId: string, email: string, expiresIn: number = 3600): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    email: email,
    role: 'authenticated',
    aal: 'aal1',
    iat: now,
    exp: now + expiresIn,
  })).toString('base64url')
  const signature = Buffer.from('mock-signature').toString('base64url')
  return `${header}.${payload}.${signature}`
}

export const mockSupabaseSession = {
  access_token: createMockJWT(mockSupabaseUser.id, mockSupabaseUser.email),
  refresh_token: 'test-refresh-token',
  expires_in: 3600,
  token_type: 'bearer',
  user: mockSupabaseUser,
}

export const mockSupabaseProfile = {
  id: mockSupabaseUser.id,
  email: mockSupabaseUser.email,
  full_name: 'Test User',
  country: 'CO',
  role: 'cliente',
  image: null,
  is_deleted: false,
  created_at: new Date().toISOString(),
}

export const createMockSupabaseClient = () => {
  const createChainableMock = (): any => {
    const chain: any = {
      select: vi.fn(function() { return chain }),
      insert: vi.fn(function() { return chain }),
      update: vi.fn(function() { return chain }),
      delete: vi.fn(function() { return chain }),
      eq: vi.fn(function() { return chain }),
      // Por defecto retorna null para que no haya conflictos con emails existentes
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      maybeSingle: vi.fn().mockResolvedValue({ data: mockSupabaseProfile, error: null }),
    }
    return chain
  }

  const mockFrom = vi.fn(() => createChainableMock())

  return {
    auth: {
      signUp: vi.fn().mockResolvedValue({
        data: { user: mockSupabaseUser, session: mockSupabaseSession },
        error: null,
      }),
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { user: mockSupabaseUser, session: mockSupabaseSession },
        error: null,
      }),
      signInWithOtp: vi.fn().mockResolvedValue({
        data: { user: null, session: null },
        error: null,
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      getUser: vi.fn().mockResolvedValue({
        data: { user: mockSupabaseUser },
        error: null,
      }),
      refreshSession: vi.fn().mockResolvedValue({
        data: { session: mockSupabaseSession },
        error: null,
      }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({
        data: {},
        error: null,
      }),
      updateUser: vi.fn().mockResolvedValue({
        data: { user: mockSupabaseUser },
        error: null,
      }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      mfa: {
        enroll: vi.fn().mockResolvedValue({
          data: {
            id: 'test-factor-id',
            type: 'totp',
            totp: {
              qr_code: 'data:image/svg+xml;base64,test',
              secret: 'test-secret',
              uri: 'otpauth://totp/test',
            },
          },
          error: null,
        }),
        challenge: vi.fn().mockResolvedValue({
          data: { id: 'test-challenge-id' },
          error: null,
        }),
        verify: vi.fn().mockResolvedValue({
          data: { access_token: 'test-access-token' },
          error: null,
        }),
        unenroll: vi.fn().mockResolvedValue({
          data: {},
          error: null,
        }),
        getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
          data: { currentLevel: 'aal1', nextLevel: 'aal2' },
          error: null,
        }),
        listFactors: vi.fn().mockResolvedValue({
          data: { all: [], totp: [] },
          error: null,
        }),
      },
    },
    from: mockFrom,
  }
}

export const mockSupabaseClient = createMockSupabaseClient()

/**
 * Resetea los mocks de Supabase a sus valores por defecto
 */
export const resetSupabaseMocks = () => {
  vi.clearAllMocks()
  
  // Recrear session con nuevo JWT
  const newSession = {
    ...mockSupabaseSession,
    access_token: createMockJWT(mockSupabaseUser.id, mockSupabaseUser.email),
  }
  
  // Resetear auth.signUp
  vi.mocked(mockSupabaseClient.auth.signUp).mockResolvedValue({
    data: { user: mockSupabaseUser, session: newSession },
    error: null,
  })
  
  // Resetear auth.signInWithPassword
  vi.mocked(mockSupabaseClient.auth.signInWithPassword).mockResolvedValue({
    data: { user: mockSupabaseUser, session: newSession },
    error: null,
  })
  
  // Resetear from() con chainable mock
  const createChainableMock = (): any => {
    const chain: any = {
      select: vi.fn(function() { return chain }),
      insert: vi.fn(function() { return chain }),
      update: vi.fn(function() { return chain }),
      delete: vi.fn(function() { return chain }),
      eq: vi.fn(function() { return chain }),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      maybeSingle: vi.fn().mockResolvedValue({ data: mockSupabaseProfile, error: null }),
    }
    return chain
  }
  
  vi.mocked(mockSupabaseClient.from).mockReturnValue(createChainableMock())
  
  // Resetear auth.getUser
  vi.mocked(mockSupabaseClient.auth.getUser).mockResolvedValue({
    data: { user: mockSupabaseUser },
    error: null,
  })
  
  // Resetear auth.refreshSession
  vi.mocked(mockSupabaseClient.auth.refreshSession).mockResolvedValue({
    data: { session: mockSupabaseSession, user: mockSupabaseUser },
    error: null,
  })
}

// Mock the Supabase module
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}))

// Mock the config/supabase module
vi.mock('@/config/supabase.js', () => ({
  supabase: mockSupabaseClient,
  supabaseAdmin: mockSupabaseClient, // Use same mock for admin
}))
