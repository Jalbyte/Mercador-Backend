import { describe, it, expect, beforeEach, vi } from 'vitest'
import '../mocks/supabase.mock.js'
import { mockSupabaseClient, mockSupabaseSession, mockSupabaseUser } from '../mocks/supabase.mock.js'
import * as userService from '@/services/user.service.js'
import { redisService } from '@/services/redis.service.js'

/**
 * TestRail Case ID: C42
 * Title: Inicio de sesión exitoso con 2FA habilitado
 * 
 * Steps:
 * 1. Ingresar credenciales válidas → Sistema solicita código 2FA
 * 2. Abrir app de autenticación → Se muestra código OTP de 6 dígitos
 * 3. Ingresar código OTP → Sistema valida el código
 * 4. Esperar redirección → Usuario redirigido al dashboard, cookie de sesión establecida
 */

describe('C42: Inicio de sesión exitoso con 2FA habilitado', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock redis service
    vi.spyOn(redisService, 'set').mockImplementation(async () => {})
    vi.spyOn(redisService, 'del').mockImplementation(async () => {})
    vi.spyOn(redisService, 'exists').mockImplementation(async () => 1)
  })

  it('C42-1: Login inicial debe devolver mfaRequired=true cuando usuario tiene 2FA habilitado', async () => {
    // Arrange: Mock MFA enabled user
    // Simular que el usuario tiene MFA habilitado (factor verificado)
    vi.mocked(mockSupabaseClient.auth.mfa.getAuthenticatorAssuranceLevel).mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2', currentAuthenticationMethods: [] },
      error: null,
    })

    vi.mocked(mockSupabaseClient.auth.mfa.listFactors).mockResolvedValue({
      data: {
        all: [
          {
            id: 'test-factor-id-123',
            type: 'totp',
            status: 'verified',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        totp: [
          {
            id: 'test-factor-id-123',
            type: 'totp',
            status: 'verified',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      },
      error: null,
    })

    // Mock profile query (sin is_deleted)
    vi.mocked(mockSupabaseClient.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: mockSupabaseUser.id, image: null, country: 'CO', is_deleted: false },
        error: null,
      }),
    } as any)

    // Act: intentar login
    const result = await userService.loginWithEmail(mockSupabaseUser.email, 'P@ssw0rd123')

    // Assert: debe retornar mfaRequired=true
    expect(result.mfaRequired).toBe(true)
    expect(result.factorId).toBe('test-factor-id-123')
    expect(result.session).toBeDefined()
    expect(result.session?.access_token).toBeDefined()

    // Debe guardar sesión temporal en Redis con prefijo mfa_pending:
    expect(redisService.set).toHaveBeenCalledWith(
      expect.stringContaining('mfa_pending:'),
      mockSupabaseUser.id,
      300 // 5 minutos
    )
  })

  it('C42-2: Verificar código OTP debe completar el login y devolver nueva sesión', async () => {
    // Arrange: simular challenge y verify exitosos
    const mockFactorId = 'test-factor-id-123'
    const mockChallengeId = 'challenge-id-456'
    const mockOtpCode = '123456'

    vi.mocked(mockSupabaseClient.auth.mfa.challenge).mockResolvedValue({
      data: { id: mockChallengeId },
      error: null,
    })

    // verify devuelve nueva sesión con access_token actualizado
    const newAccessToken = 'new-access-token-after-mfa'
    const newRefreshToken = 'new-refresh-token-after-mfa'
    vi.mocked(mockSupabaseClient.auth.mfa.verify).mockResolvedValue({
      data: {
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        expires_in: 3600,
        token_type: 'bearer',
        user: mockSupabaseUser,
      },
      error: null,
    })

    // Act: verificar MFA
    const result = await userService.verifyMFA(mockSupabaseSession.access_token, mockFactorId, mockOtpCode)

    // Assert: debe retornar nueva sesión
    expect(result.data).toBeDefined()
    expect(result.data?.access_token).toBe(newAccessToken)
    expect(result.data?.refresh_token).toBe(newRefreshToken)
    expect(result.error).toBeNull()

    // Verificar que se llamó a challenge y verify
    expect(mockSupabaseClient.auth.mfa.challenge).toHaveBeenCalledWith({ factorId: mockFactorId })
    expect(mockSupabaseClient.auth.mfa.verify).toHaveBeenCalledWith({
      factorId: mockFactorId,
      challengeId: mockChallengeId,
      code: mockOtpCode,
    })
  })

  it('C42-3: completeMFALogin debe mover sesión de mfa_pending a session en Redis', async () => {
    // Arrange
    const newAccessToken = 'new-access-token-after-mfa'
    const refreshToken = 'new-refresh-token'
    const userId = mockSupabaseUser.id
    const expiresIn = 3600
    const originalTempToken = 'temp-token-before-mfa'

    // Act: completar login MFA
    const result = await userService.completeMFALogin(newAccessToken, refreshToken, userId, expiresIn, originalTempToken)

    // Assert: success
    expect(result.success).toBe(true)

    // Verificar que se guardó la nueva sesión en Redis
    expect(redisService.set).toHaveBeenCalledWith(
      `session:${newAccessToken}`,
      userId,
      expiresIn
    )

    // Verificar que se guardó el refresh token
    const expectedRefreshTtl = 7 * 24 * 60 * 60 // 7 días por defecto
    expect(redisService.set).toHaveBeenCalledWith(
      `refresh:${refreshToken}`,
      userId,
      expectedRefreshTtl
    )
  })

  it('C42-4: Login con MFA incorrecto debe fallar en verify', async () => {
    // Arrange: simular código OTP incorrecto
    const mockFactorId = 'test-factor-id-123'
    const mockChallengeId = 'challenge-id-456'
    const wrongOtpCode = '000000'

    vi.mocked(mockSupabaseClient.auth.mfa.challenge).mockResolvedValue({
      data: { id: mockChallengeId },
      error: null,
    })

    vi.mocked(mockSupabaseClient.auth.mfa.verify).mockResolvedValue({
      data: null,
      error: { message: 'Invalid TOTP code', status: 400, __isAuthError: true, name: 'AuthApiError' },
    })

    // Act: verificar con código incorrecto
    const result = await userService.verifyMFA(mockSupabaseSession.access_token, mockFactorId, wrongOtpCode)

    // Assert: debe retornar error
    expect(result.data).toBeNull()
    expect(result.error).toBeDefined()
    expect(result.error?.message).toContain('Invalid')
  })
})
