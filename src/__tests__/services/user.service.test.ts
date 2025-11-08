/**
 * Tests for User Service
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
// Import mocks first, before the service
import '../mocks/supabase.mock.js'
import '../mocks/redis.mock.js'
import {
  signupWithEmail,
  loginWithEmail,
  refreshSession,
  getUserByAccessToken,
} from '@/services/user.service.js'
import { mockSupabaseClient, mockSupabaseUser, mockSupabaseSession, resetSupabaseMocks } from '../mocks/supabase.mock.js'
import { clearMockRedis } from '../mocks/redis.mock.js'

describe('User Service', () => {
  beforeEach(() => {
    clearMockRedis()
    resetSupabaseMocks() // Resetear todos los mocks de Supabase
  })

  describe('signupWithEmail', () => {
    it('should successfully register a new user', async () => {
      const result = await signupWithEmail(
        'newuser@example.com',
        'SecurePass123!',
        {
          full_name: 'New User',
          country: 'CO',
          role: 'cliente',
        }
      )

      expect(result.data).toBeDefined()
      expect(result.data?.user).toBeDefined()
      expect(mockSupabaseClient.auth.signUp).toHaveBeenCalledWith({
        email: 'newuser@example.com',
        password: 'SecurePass123!',
        options: {
          data: {
            full_name: 'New User',
            country: 'CO',
            role: 'cliente',
          },
        },
      })
    })

    it('should reject registration with deleted account email', async () => {
      // Mock profile check to return deleted account
      vi.mocked(mockSupabaseClient.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'test-id', is_deleted: true },
          error: null,
        }),
      } as any)

      await expect(
        signupWithEmail('deleted@example.com', 'password', {})
      ).rejects.toThrow('deleted')
    })

    it('should use default values for missing metadata', async () => {
      const result = await signupWithEmail(
        'user@example.com',
        'password',
        {}
      )

      expect(mockSupabaseClient.auth.signUp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            data: expect.objectContaining({
              role: 'cliente',
            }),
          }),
        })
      )
    })
  })

  describe('loginWithEmail', () => {
    it('should successfully login a user', async () => {
      // Mock para retornar un perfil válido (no eliminado)
      vi.mocked(mockSupabaseClient.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { 
            id: mockSupabaseUser.id,
            email: mockSupabaseUser.email,
            is_deleted: false 
          },
          error: null,
        }),
      } as any)

      const result = await loginWithEmail('test@example.com', 'password')

      expect(result.user).toBeDefined()
      expect(result.session).toBeDefined()
      expect(result.mfaRequired).toBe(false)
      expect(mockSupabaseClient.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password',
      })
    })

    it('should reject login for deleted account', async () => {
      // Mock profile check to return deleted account
      vi.mocked(mockSupabaseClient.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { is_deleted: true },
          error: null,
        }),
      } as any)

      await expect(
        loginWithEmail('deleted@example.com', 'password')
      ).rejects.toThrow('deleted')
    })

    it('should handle MFA requirement', async () => {
      // Mock para retornar un perfil válido (no eliminado)
      vi.mocked(mockSupabaseClient.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { 
            id: mockSupabaseUser.id,
            email: 'mfa@example.com',
            is_deleted: false 
          },
          error: null,
        }),
      } as any)

      // Mock MFA enabled user
      vi.mocked(mockSupabaseClient.auth.mfa.getAuthenticatorAssuranceLevel).mockResolvedValue({
        data: { currentLevel: 'aal1', nextLevel: 'aal2' },
        error: null,
      })

      vi.mocked(mockSupabaseClient.auth.mfa.listFactors).mockResolvedValue({
        data: {
          all: [{ id: 'factor-123', status: 'verified', type: 'totp' }],
          totp: [{ id: 'factor-123', status: 'verified', type: 'totp' }],
        },
        error: null,
      } as any)

      const result = await loginWithEmail('mfa@example.com', 'password')

      expect(result.mfaRequired).toBe(true)
      expect(result.factorId).toBe('factor-123')
    })

    it('should throw error on invalid credentials', async () => {
      mockSupabaseClient.auth.signInWithPassword.mockResolvedValueOnce({
        data: { user: null, session: null },
        error: { message: 'Invalid credentials' },
      } as any)

      await expect(
        loginWithEmail('wrong@example.com', 'wrongpass')
      ).rejects.toThrow('Invalid credentials')
    })
  })

  describe('refreshSession', () => {
    it('should successfully refresh session', async () => {
      const refreshToken = 'test-refresh-token'

      // Mock para retornar un perfil válido (no eliminado)
      vi.mocked(mockSupabaseClient.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { 
            id: mockSupabaseUser.id,
            email: mockSupabaseUser.email,
            is_deleted: false 
          },
          error: null,
        }),
      } as any)

      const result = await refreshSession(refreshToken)

      expect(result).toBeDefined()
      expect(result?.access_token).toBeDefined()
      expect(mockSupabaseClient.auth.refreshSession).toHaveBeenCalledWith({
        refresh_token: refreshToken,
      })
    })

    it('should reject refresh for deleted account', async () => {
      // Mock profile check to return deleted account
      vi.mocked(mockSupabaseClient.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { is_deleted: true },
          error: null,
        }),
      } as any)

      await expect(
        refreshSession('test-refresh-token')
      ).rejects.toThrow('deleted')
    })
  })

  describe('getUserByAccessToken', () => {
    it('should get user by access token', async () => {
      // Mock para retornar un perfil válido
      vi.mocked(mockSupabaseClient.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { 
            id: mockSupabaseUser.id,
            email: mockSupabaseUser.email,
            full_name: 'Test User',
            is_deleted: false,
            role: 'cliente'
          },
          error: null,
        }),
      } as any)

      const result = await getUserByAccessToken('test-access-token')

      expect(result.data).toBeDefined()
      expect(result.data?.user).toBeDefined()
      expect(result.error).toBeNull()
    })

    it('should reject access for deleted account', async () => {
      // Mock profile check to return deleted account
      vi.mocked(mockSupabaseClient.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { is_deleted: true },
          error: null,
        }),
      } as any)

      const result = await getUserByAccessToken('test-access-token')

      expect(result.data).toBeNull()
      expect(result.error).toBeDefined()
      expect(result.error?.message).toContain('deleted')
    })

    it('should handle invalid token', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'Invalid token' },
      } as any)

      const result = await getUserByAccessToken('invalid-token')

      expect(result.error).toBeDefined()
    })
  })
})
