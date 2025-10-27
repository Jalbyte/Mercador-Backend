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

export const mockSupabaseSession = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  expires_in: 3600,
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
  const mockFrom = vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: mockSupabaseProfile, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: mockSupabaseProfile, error: null }),
  }))

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

// Mock the Supabase module
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}))

// Mock the config/supabase module
vi.mock('@/config/supabase.js', () => ({
  supabase: mockSupabaseClient,
  supabaseAdmin: mockSupabaseClient, // Use same mock for admin
}))
