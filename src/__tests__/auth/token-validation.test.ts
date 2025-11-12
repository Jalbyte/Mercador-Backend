import { describe, it, expect, beforeEach, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import '../mocks/supabase.mock.js'
import { mockSupabaseClient, mockSupabaseSession, mockSupabaseUser } from '../mocks/supabase.mock.js'
import * as userService from '../../services/user.service.js'
import { redisService } from '../../services/redis.service.js'
import { OpenAPIHono } from '@hono/zod-openapi'
import authRoutes from '../../routes/auth.js'
import { cookieToAuthHeader } from '../../middlewares/cookieToAuthHeader.js'
import { authMiddleware } from '../../middlewares/authMiddleware.js'

/**
 * TestRail Case ID: C44
 * Title: Validación de token generado
 * 
 * Steps:
 * 1. Ingresar credenciales válidas → Sistema acepta y genera token
 * 2. Si tiene 2FA, ingresar código OTP → Sistema valida y genera token
 * 3. Inspeccionar cookies → Debe existir cookie de sesión con token JWT
 * 4. Copiar valor del token → Token se copia correctamente
 * 5. Decodificar token con jwt.io → Token contiene claims (payload)
 * 6. Verificar campo 'exp' → Debe ser fecha futura (token válido)
 * 7. Usar token para acceder a recurso protegido → Acción exitosa
 */

describe('C44: Validación de token generado', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock redis service
    vi.spyOn(redisService, 'set').mockImplementation(async () => {})
    vi.spyOn(redisService, 'get').mockImplementation(async () => null)
    vi.spyOn(redisService, 'exists').mockImplementation(async () => 1)
  })

  it('C44-1: Login exitoso debe generar un token JWT válido con estructura correcta', async () => {
    // Arrange: mock login sin MFA
    vi.mocked(mockSupabaseClient.auth.mfa.listFactors).mockResolvedValue({
      data: { all: [], totp: [] },
      error: null,
    })

    // Act: realizar login
    const result = await userService.loginWithEmail(mockSupabaseUser.email, 'P@ssw0rd123')

    // Assert: debe retornar sesión con access_token
    expect(result.session).toBeDefined()
    expect(result.session?.access_token).toBeDefined()

    const token = result.session!.access_token

    // Step 5: Decodificar token (simula jwt.io)
    const decoded = jwt.decode(token) as any

    // Assert: token debe tener estructura JWT válida
    expect(decoded).toBeDefined()
    expect(decoded).toHaveProperty('sub') // subject (user id)
    expect(decoded).toHaveProperty('exp') // expiration
    expect(decoded).toHaveProperty('iat') // issued at

    // Step 6: Verificar que 'exp' es fecha futura
    const nowInSeconds = Math.floor(Date.now() / 1000)
    expect(decoded.exp).toBeGreaterThan(nowInSeconds)

    // Verificar que el token expira en un tiempo razonable (máximo 24 horas)
    const expiresInSeconds = decoded.exp - nowInSeconds
    expect(expiresInSeconds).toBeGreaterThan(0)
    expect(expiresInSeconds).toBeLessThanOrEqual(24 * 60 * 60) // max 24 horas
  })

  it('C44-2: Token debe contener claims correctos del usuario', async () => {
    // Arrange: mock login
    vi.mocked(mockSupabaseClient.auth.mfa.listFactors).mockResolvedValue({
      data: { all: [], totp: [] },
      error: null,
    })

    // Act: realizar login
    const result = await userService.loginWithEmail(mockSupabaseUser.email, 'P@ssw0rd123')
    const token = result.session!.access_token

    // Step 5: Decodificar token
    const decoded = jwt.decode(token) as any

    // Assert: verificar claims esperados
    expect(decoded.sub).toBeDefined() // User ID
    expect(decoded.email).toBeDefined() // Email del usuario
    expect(decoded.role || decoded.user_metadata?.role).toBeDefined() // Rol
    
    // Verificar que el token type es correcto
    expect(result.session?.token_type).toBe('bearer')
  })

  it('C44-3: Cookie de sesión debe contener el token JWT', async () => {
    // Arrange: mount auth routes
    const app = new OpenAPIHono()
    app.route('/auth', authRoutes)

    const body = JSON.stringify({ email: mockSupabaseUser.email, password: 'P@ssw0rd123' })
    const req = new Request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    // Act: hacer login
    const res = await app.fetch(req as any)

    // Assert: verificar status 200
    expect(res.status).toBe(200)

    // Step 3: Inspeccionar cookies del navegador
    const setCookie = res.headers.get('set-cookie') || ''
    
    // Assert: debe existir cookie sb_access_token
    expect(setCookie).toContain('sb_access_token=')

    // Step 4: Extraer el valor del token de la cookie
    const tokenMatch = setCookie.match(/sb_access_token=([^;]+)/)
    expect(tokenMatch).toBeDefined()
    
    const token = tokenMatch![1]
    expect(token).toBeDefined()
    expect(token.length).toBeGreaterThan(0)

    // Step 5: Verificar que el token es JWT válido (formato base64.base64.base64)
    const jwtParts = token.split('.')
    expect(jwtParts).toHaveLength(3) // header.payload.signature
  })

  it('C44-4: Token válido debe permitir acceso a recursos protegidos', async () => {
    // Arrange: montar rutas protegidas
    const app = new OpenAPIHono()
    app.use('/auth/*', cookieToAuthHeader)
    app.use('/auth/*', authMiddleware)
    app.route('/auth', authRoutes)

    // Mock successful auth validation
    vi.mocked(mockSupabaseClient.auth.getUser).mockResolvedValue({
      data: { user: mockSupabaseUser },
      error: null,
    })

    // Mock profile query
    vi.mocked(mockSupabaseClient.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: mockSupabaseUser.id,
          email: mockSupabaseUser.email,
          full_name: 'Test User',
          role: 'cliente',
          image: null,
          country: 'CO',
        },
        error: null,
      }),
    } as any)

    // Step 7: Intentar acceder a recurso protegido con token válido
    const req = new Request('http://localhost/auth/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${mockSupabaseSession.access_token}`,
        'Content-Type': 'application/json',
      },
    })

    // Act: acceder al perfil (recurso protegido)
    const res = await app.fetch(req as any)

    // Assert: la acción debe completarse exitosamente
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.data).toBeDefined()
    expect(data.data.id).toBe(mockSupabaseUser.id)
  })

  it('C44-5: Token con 2FA debe ser válido después de completar verificación OTP', async () => {
    // Arrange: simular login con MFA
    vi.mocked(mockSupabaseClient.auth.mfa.getAuthenticatorAssuranceLevel).mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2', currentAuthenticationMethods: [] },
      error: null,
    })

    vi.mocked(mockSupabaseClient.auth.mfa.listFactors).mockResolvedValue({
      data: {
        all: [{ id: 'factor-123', type: 'totp', status: 'verified', created_at: '', updated_at: '' }],
        totp: [{ id: 'factor-123', type: 'totp', status: 'verified', created_at: '', updated_at: '' }],
      },
      error: null,
    })

    vi.mocked(mockSupabaseClient.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: mockSupabaseUser.id, image: null, country: 'CO', is_deleted: false },
        error: null,
      }),
    } as any)

    // Step 1-2: Login con MFA
    const loginResult = await userService.loginWithEmail(mockSupabaseUser.email, 'P@ssw0rd123')
    expect(loginResult.mfaRequired).toBe(true)

    const tempToken = loginResult.session!.access_token

    // Simular verificación OTP exitosa - generar un JWT válido para MFA
    // Importar la función helper del mock
    const createMockJWT = (userId: string, email: string, expiresIn: number = 3600): string => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
      const now = Math.floor(Date.now() / 1000)
      const payload = Buffer.from(JSON.stringify({
        sub: userId,
        email: email,
        role: 'authenticated',
        aal: 'aal2', // Nivel de autenticación después de MFA
        iat: now,
        exp: now + expiresIn,
      })).toString('base64url')
      const signature = Buffer.from('mock-signature-mfa').toString('base64url')
      return `${header}.${payload}.${signature}`
    }
    
    const newAccessToken = createMockJWT(mockSupabaseUser.id, mockSupabaseUser.email)
    
    vi.mocked(mockSupabaseClient.auth.mfa.challenge).mockResolvedValue({
      data: { id: 'challenge-123' },
      error: null,
    })

    vi.mocked(mockSupabaseClient.auth.mfa.verify).mockResolvedValue({
      data: {
        access_token: newAccessToken,
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
        token_type: 'bearer',
        user: mockSupabaseUser,
      },
      error: null,
    })

    const verifyResult = await userService.verifyMFA(tempToken, 'factor-123', '123456')

    // Assert: nuevo token después de MFA debe ser válido
    expect(verifyResult.data).toBeDefined()
    expect(verifyResult.data?.access_token).toBe(newAccessToken)

    // Step 5-6: Decodificar y validar nuevo token
    const decoded = jwt.decode(newAccessToken) as any
    expect(decoded).toBeDefined()

    // Verificar estructura y expiración
    const nowInSeconds = Math.floor(Date.now() / 1000)
    if (decoded.exp) {
      expect(decoded.exp).toBeGreaterThan(nowInSeconds)
    }
  })

  it('C44-6: Token expirado no debe permitir acceso a recursos protegidos', async () => {
    // Arrange: crear token expirado
    const expiredToken = 'expired-token-123'

    // Mock getUser para simular token expirado
    vi.mocked(mockSupabaseClient.auth.getUser).mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid token', status: 401, __isAuthError: true, name: 'AuthApiError' },
    })

    const app = new OpenAPIHono()
    app.use('/auth/*', cookieToAuthHeader)
    app.use('/auth/*', authMiddleware)
    app.route('/auth', authRoutes)

    // Act: intentar acceder con token expirado
    const req = new Request('http://localhost/auth/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${expiredToken}`,
        'Content-Type': 'application/json',
      },
    })

    const res = await app.fetch(req as any)

    // Assert: debe rechazar con 401 Unauthorized
    expect(res.status).toBe(401)
  })
})
