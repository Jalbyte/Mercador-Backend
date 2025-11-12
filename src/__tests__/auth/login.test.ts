import { describe, it, expect, beforeEach, vi } from 'vitest'
import '../mocks/supabase.mock.js'
import { mockSupabaseClient, mockSupabaseSession, mockSupabaseUser } from '../mocks/supabase.mock.js'
import * as userService from '../../services/user.service.js'
import { redisService } from '../../services/redis.service.js'
import { OpenAPIHono } from '@hono/zod-openapi'
import authRoutes from '../../routes/auth.js'

/**
 * TestRail Case ID: C41
 * Title: Inicio de sesión exitoso con credenciales válidas
 * Steps covered (mapped to unit/integration level):
 * 1-3: Validar que loginWithEmail acepta email/contraseña y devuelve sesión
 * 4-6: Validar que la ruta `/auth/login` responde 200 y establece cookies de sesión
 */

describe('C41: Inicio de sesión exitoso con credenciales válidas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock redis service to avoid real connections
    vi.spyOn(redisService, 'set').mockImplementation(async () => {})
  })

  it('C41-1: Debe iniciar sesión y devolver una sesión válida (unit)', async () => {
    // Arrange: supabase mock ya configurado en ../mocks
    const res = await userService.loginWithEmail(mockSupabaseUser.email, 'P@ssw0rd123')

    // Assert: session returned
    expect(res).toBeDefined()
  expect(res.session).toBeDefined()
  expect(res.session?.user).toBeDefined()
  expect(res.session?.user.email).toBe(mockSupabaseUser.email)
    expect(res.mfaRequired).toBeFalsy()

    // Redis should be called to store session and refresh token
    expect(redisService.set).toHaveBeenCalled()
    // Check that the access token was used when setting session
    expect(redisService.set).toHaveBeenCalledWith(
      expect.stringContaining('session:'),
      expect.any(String),
      expect.any(Number)
    )
  })

  it('C41-2: Ruta POST /auth/login debe responder 200 y establecer cookies (integration-ish)', async () => {
    // Arrange: mount authRoutes into a small Hono app and call fetch
    const app = new OpenAPIHono()
    app.route('/auth', authRoutes)

    const body = JSON.stringify({ email: mockSupabaseUser.email, password: 'P@ssw0rd123' })
    const req = new Request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    // Act
    const res = await app.fetch(req as any)

    // Assert
    expect(res.status).toBe(200)

    // Check Set-Cookie header contains access and refresh tokens
    const setCookie = res.headers.get('set-cookie') || ''
    // Hono may return multiple Set-Cookie headers joined by `,` depending on env; verify substrings
    expect(setCookie).toEqual(expect.stringContaining('sb_access_token='))
    expect(setCookie).toEqual(expect.stringContaining('sb_refresh_token='))
  })
})
