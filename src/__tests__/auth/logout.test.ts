import { describe, it, expect, beforeEach, vi } from 'vitest'
import '../mocks/supabase.mock.js'
import { mockSupabaseClient, mockSupabaseSession, mockSupabaseUser, resetSupabaseMocks } from '../mocks/supabase.mock.js'
import * as userService from '../../services/user.service.js'
import { redisService } from '../../services/redis.service.js'
import { OpenAPIHono } from '@hono/zod-openapi'
import authRoutes from '../../routes/auth.js'
import { cookieToAuthHeader } from '../../middlewares/cookieToAuthHeader.js'
import { authMiddleware } from '../../middlewares/authMiddleware.js'

/**
 * TestRail Case ID: C62
 * Title: Cierre de sesión
 * 
 * Steps:
 * 1. Iniciar sesión con credenciales válidas → Sesión establecida, redirige a dashboard
 * 2. Navegar a opción 'Cerrar sesión' → Se muestra opción
 * 3. Hacer clic en 'Cerrar sesión' → Sistema procesa cierre de sesión
 * 4. Intentar acceder a página protegida después de logout → Redirige a login, sesión expirada
 * 5. Verificar cookies del navegador → Cookie de sesión no existe o ha expirado
 * 
 * Expected Results:
 * - Logout exitoso limpia las cookies de sesión
 * - Token de acceso es invalidado en Redis
 * - No se puede acceder a recursos protegidos después de logout
 * - Cookies tienen Max-Age=0 para expirarlas
 */

describe('C62: Cierre de sesión', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetSupabaseMocks()
  })

  it('C62-1: Endpoint /auth/logout debe existir y retornar 200', async () => {
    // Arrange: montar rutas de auth
    const app = new OpenAPIHono()
    app.route('/auth', authRoutes)

    // Step 3: Hacer POST a /auth/logout
    const req = new Request('http://localhost/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `sb_access_token=${mockSupabaseSession.access_token}; sb_refresh_token=${mockSupabaseSession.refresh_token}`,
      },
    })

    // Act: hacer logout
    const res = await app.fetch(req as any)

    // Assert: logout exitoso
    expect(res.status).toBe(200)

    const json = await res.json() as { success: boolean; message: string }
    expect(json.success).toBe(true)
    expect(json.message).toMatch(/sesión cerrada|logout|exitoso/i)
  })

  it('C62-2: Logout debe limpiar cookies de sesión con Max-Age=0', async () => {
    // Arrange: montar rutas de auth
    const app = new OpenAPIHono()
    app.route('/auth', authRoutes)

    // Step 3: Hacer logout
    const req = new Request('http://localhost/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `sb_access_token=${mockSupabaseSession.access_token}; sb_refresh_token=${mockSupabaseSession.refresh_token}`,
      },
    })

    const res = await app.fetch(req as any)

    // Step 5: Verificar que las cookies sean limpiadas
    const setCookieHeaders = res.headers.get('set-cookie')
    expect(setCookieHeaders).toBeDefined()
    
    // Debe contener instrucciones para limpiar las cookies (Max-Age=0)
    expect(setCookieHeaders).toContain('Max-Age=0')
    expect(setCookieHeaders).toMatch(/sb_access_token|sb_refresh_token/)
  })

  it('C62-3: Logout debe invalidar el refresh token en Redis', async () => {
    // Arrange: montar rutas de auth
    const app = new OpenAPIHono()
    app.route('/auth', authRoutes)

    // Mock Redis delete
    const redisSpy = vi.spyOn(redisService, 'del')

    // Step 3: Hacer logout con refresh token
    const req = new Request('http://localhost/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `sb_access_token=${mockSupabaseSession.access_token}; sb_refresh_token=${mockSupabaseSession.refresh_token}`,
      },
    })

    await app.fetch(req as any)

    // Assert: debe eliminar el refresh token de Redis
    expect(redisSpy).toHaveBeenCalledWith(`refresh:${mockSupabaseSession.refresh_token}`)
  })

  it('C62-4: Intentar acceder con token inválido después de logout debe fallar', async () => {
    // Este test simula el caso donde un usuario intenta usar un token después del logout
    const app = new OpenAPIHono()
    app.use('/auth/*', cookieToAuthHeader)
    app.use('/auth/*', authMiddleware)
    app.route('/auth', authRoutes)

    // Step 3: Hacer logout
    let req = new Request('http://localhost/auth/logout', {
      method: 'POST',
      headers: {
        'Cookie': `sb_access_token=${mockSupabaseSession.access_token}; sb_refresh_token=${mockSupabaseSession.refresh_token}`,
      },
    })

    let res = await app.fetch(req as any)
    expect(res.status).toBe(200)

    // Step 5: Verificar que las cookies fueron limpiadas
    const setCookieHeaders = res.headers.get('set-cookie')
    expect(setCookieHeaders).toContain('Max-Age=0')

    // Step 4: Simular intento de acceso con token inválido (después del logout)
    // Mock que el token ya no es válido (Supabase lo rechaza)
    vi.mocked(mockSupabaseClient.auth.getUser).mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid token', status: 401, __isAuthError: true, name: 'AuthApiError' },
    })

    // Intentar acceder a recurso protegido con token inválido
    req = new Request('http://localhost/auth/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${mockSupabaseSession.access_token}`,
      },
    })

    res = await app.fetch(req as any)

    // Step 4: Debe retornar 401 porque el token es inválido
    expect(res.status).toBe(401)
  })

  it('C62-5: Logout sin cookies debe funcionar (logout idempotente)', async () => {
    // Arrange: montar rutas de auth
    const app = new OpenAPIHono()
    app.route('/auth', authRoutes)

    // Step 3: Hacer logout sin cookies (usuario ya cerró sesión)
    const req = new Request('http://localhost/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const res = await app.fetch(req as any)

    // Assert: debe retornar 200 de todas formas (logout idempotente)
    expect(res.status).toBe(200)

    const json = await res.json() as { success: boolean }
    expect(json.success).toBe(true)
  })

  it('C62-6: Cookies de logout deben tener atributos de seguridad correctos', async () => {
    // Arrange: montar rutas de auth
    const app = new OpenAPIHono()
    app.route('/auth', authRoutes)

    // Step 3: Hacer logout
    const req = new Request('http://localhost/auth/logout', {
      method: 'POST',
      headers: {
        'Cookie': `sb_access_token=${mockSupabaseSession.access_token}; sb_refresh_token=${mockSupabaseSession.refresh_token}`,
      },
    })

    const res = await app.fetch(req as any)

    // Step 5: Verificar atributos de seguridad en las cookies
    const setCookieHeaders = res.headers.get('set-cookie')
    expect(setCookieHeaders).toBeDefined()

    // Debe tener HttpOnly para prevenir acceso desde JavaScript
    expect(setCookieHeaders).toContain('HttpOnly')

    // Debe tener SameSite para prevenir CSRF
    expect(setCookieHeaders).toMatch(/SameSite=(Lax|Strict)/i)

    // Max-Age=0 para expirar inmediatamente
    expect(setCookieHeaders).toContain('Max-Age=0')

    // Path debe estar definido
    expect(setCookieHeaders).toContain('Path=/')
  })

  it('C62-7: Servicio revokeRefreshToken debe eliminar token de Redis', async () => {
    // Mock Redis delete
    const redisSpy = vi.spyOn(redisService, 'del').mockResolvedValue(1)

    const testRefreshToken = 'test-refresh-token-123'

    // Act: revocar refresh token
    await userService.revokeRefreshToken(testRefreshToken)

    // Assert: debe llamar a Redis con la key correcta
    expect(redisSpy).toHaveBeenCalledWith(`refresh:${testRefreshToken}`)
    expect(redisSpy).toHaveBeenCalledTimes(1)
  })

  it('C62-8: Logout debe funcionar incluso si Redis falla', async () => {
    // Arrange: montar rutas de auth
    const app = new OpenAPIHono()
    app.route('/auth', authRoutes)

    // Mock Redis para que falle
    vi.spyOn(redisService, 'del').mockRejectedValue(new Error('Redis error'))

    // Step 3: Hacer logout
    const req = new Request('http://localhost/auth/logout', {
      method: 'POST',
      headers: {
        'Cookie': `sb_access_token=${mockSupabaseSession.access_token}; sb_refresh_token=${mockSupabaseSession.refresh_token}`,
      },
    })

    const res = await app.fetch(req as any)

    // Assert: logout debe funcionar incluso si Redis falla
    expect(res.status).toBe(200)

    const json = await res.json() as { success: boolean }
    expect(json.success).toBe(true)
  })
})
