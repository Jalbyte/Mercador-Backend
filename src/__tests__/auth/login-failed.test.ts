import { describe, it, expect, beforeEach, vi } from 'vitest'
import '../mocks/supabase.mock.js'
import { mockSupabaseClient, mockSupabaseUser, resetSupabaseMocks } from '../mocks/supabase.mock.js'
import * as userService from '@/services/user.service.js'
import { OpenAPIHono } from '@hono/zod-openapi'
import authRoutes from '@/routes/auth.js'

/**
 * TestRail Case ID: C58
 * Title: Inicio de sesión fallido con credenciales inválidas
 * 
 * Steps:
 * 1. Navegar a la página de inicio de sesión → Página se muestra correctamente
 * 2. Ingresar un email inválido (formato incorrecto o inexistente) → Campo acepta texto
 * 3. Ingresar una contraseña inválida → Campo acepta texto
 * 4. Hacer clic en 'Iniciar sesión' → Sistema intenta autenticar
 * 5. Verificar que no se generó token de sesión → No hay token en cookies
 * 6. Verificar mensaje de error apropiado → Mensaje claro de error
 * 7. Intentar varias veces con credenciales inválidas → Sistema muestra error y puede bloquear acceso (rate limit)
 * 
 * Expected Results:
 * - No se genera token de sesión con credenciales inválidas
 * - Se muestra mensaje de error claro
 * - Sistema no permite acceso con credenciales incorrectas
 * - Rate limit puede bloquear después de varios intentos
 */

describe('C58: Inicio de sesión fallido con credenciales inválidas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetSupabaseMocks()
  })

  it('C58-1: Email con formato inválido debe ser rechazado', async () => {
    // Step 2: Ingresar email con formato inválido
    const invalidEmails = [
      'not-an-email',
      '@example.com',
      'user@',
      'user @example.com',
      'user..name@example.com',
    ]

    for (const invalidEmail of invalidEmails) {
      // Mock Supabase para rechazar email inválido
      vi.mocked(mockSupabaseClient.auth.signInWithPassword).mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid email format', status: 400, __isAuthError: true, name: 'AuthApiError' },
      })

      // Step 4: Intentar login - debe lanzar error
      // Step 5-6: Verificar que se lanzó error apropiado
      await expect(userService.loginWithEmail(invalidEmail, 'P@ssw0rd123'))
        .rejects
        .toThrow(/Login failed|Invalid email/i)
    }
  })

  it('C58-2: Email inexistente debe ser rechazado', async () => {
    // Step 2: Ingresar email que no existe en la base de datos
    const nonExistentEmail = 'nonexistent@example.com'

    // Mock Supabase para rechazar email inexistente
    vi.mocked(mockSupabaseClient.auth.signInWithPassword).mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials', status: 400, __isAuthError: true, name: 'AuthApiError' },
    })

    // Step 4: Intentar login - debe lanzar error
    // Step 5-6: Verificar que se lanzó error apropiado
    await expect(userService.loginWithEmail(nonExistentEmail, 'P@ssw0rd123'))
      .rejects
      .toThrow(/Login failed|Invalid login credentials/i)
  })

  it('C58-3: Contraseña incorrecta debe ser rechazada', async () => {
    // Step 3: Ingresar contraseña incorrecta para usuario existente
    const correctEmail = mockSupabaseUser.email
    const wrongPassword = 'WrongPassword123!'

    // Mock Supabase para rechazar contraseña incorrecta
    vi.mocked(mockSupabaseClient.auth.signInWithPassword).mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials', status: 400, __isAuthError: true, name: 'AuthApiError' },
    })

    // Step 4: Intentar login - debe lanzar error
    // Step 5-6: Verificar que se lanzó error apropiado
    await expect(userService.loginWithEmail(correctEmail, wrongPassword))
      .rejects
      .toThrow(/Login failed|Invalid login credentials/i)
  })

  it('C58-4: Endpoint /auth/login debe retornar 401 con credenciales inválidas', async () => {
    // Arrange: montar rutas de auth
    const app = new OpenAPIHono()
    app.route('/auth', authRoutes)

    // Mock Supabase para rechazar login
    vi.mocked(mockSupabaseClient.auth.signInWithPassword).mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials', status: 400, __isAuthError: true, name: 'AuthApiError' },
    })

    // Step 4: Hacer POST a /auth/login con credenciales inválidas
    const body = JSON.stringify({ 
      email: 'wrong@example.com', 
      password: 'WrongPassword123!' 
    })
    
    const req = new Request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    // Act: hacer login
    const res = await app.fetch(req as any)

    // Step 5-6: Verificar respuesta de error
    expect(res.status).toBe(401)

    const json = await res.json() as { success: boolean; error: string }
    expect(json.success).toBe(false)
    expect(json.error).toBeDefined()
    expect(json.error.toLowerCase()).toMatch(/invalid|incorrect|credenciales/)

    // Step 5: Verificar que no se generaron cookies de sesión
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) {
      // Si hay cookies, deben estar vacías o ser de borrado
      expect(setCookie).not.toContain('sb_access_token=')
    }
  })

  it('C58-5: No debe generarse token JWT con credenciales inválidas', async () => {
    // Arrange: montar rutas de auth
    const app = new OpenAPIHono()
    app.route('/auth', authRoutes)

    // Mock Supabase para rechazar login
    vi.mocked(mockSupabaseClient.auth.signInWithPassword).mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials', status: 400, __isAuthError: true, name: 'AuthApiError' },
    })

    // Step 4: Intentar login con credenciales inválidas
    const body = JSON.stringify({ 
      email: 'wrong@example.com', 
      password: 'WrongPassword123!' 
    })
    
    const req = new Request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    const res = await app.fetch(req as any)

    // Step 5: Verificar que no se generó token de sesión
    expect(res.status).toBe(401)
    
    const setCookie = res.headers.get('set-cookie') || ''
    
    // No debe haber token en las cookies
    expect(setCookie).not.toMatch(/sb_access_token=.*\..*\..*/) // No JWT format (header.payload.signature)
  })

  it('C58-6: Múltiples intentos fallidos deben mostrar mensaje de error consistente', async () => {
    // Step 7: Intentar login varias veces con credenciales inválidas
    const app = new OpenAPIHono()
    app.route('/auth', authRoutes)

    // Mock Supabase para rechazar login
    vi.mocked(mockSupabaseClient.auth.signInWithPassword).mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials', status: 400, __isAuthError: true, name: 'AuthApiError' },
    })

    const attempts = 5
    const results: Array<{ status: number; error: string }> = []

    // Hacer múltiples intentos
    for (let i = 0; i < attempts; i++) {
      const body = JSON.stringify({ 
        email: 'attacker@example.com', 
        password: `WrongPassword${i}` 
      })
      
      const req = new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })

      const res = await app.fetch(req as any)
      const json = await res.json() as { success: boolean; error: string | { message?: string } }
      
      // Extraer mensaje de error (puede ser string o objeto)
      const errorMsg = typeof json.error === 'string' 
        ? json.error 
        : (json.error?.message || 'Unknown error')
      
      results.push({
        status: res.status,
        error: errorMsg,
      })
    }

    // Step 7: Verificar que todos los intentos fallaron
    expect(results).toHaveLength(attempts)
    
    results.forEach((result, index) => {
      // Aceptar 400 (Bad Request/Validation) o 401 (Unauthorized)
      expect(result.status).toBeGreaterThanOrEqual(400)
      expect(result.status).toBeLessThan(500)
      expect(result.error).toBeDefined()
      expect(result.error.toLowerCase()).toMatch(/invalid|incorrect|credenciales|login failed/)
    })

    // Verificar consistencia del mensaje de error
    const firstError = results[0].error
    results.forEach((result) => {
      // El mensaje debe ser consistente (no revelar información específica)
      expect(result.error).toBe(firstError)
    })
  })

  it('C58-7: Credenciales vacías deben ser rechazadas con error de validación', async () => {
    // Arrange: montar rutas de auth
    const app = new OpenAPIHono()
    app.route('/auth', authRoutes)

    // Test con email vacío
    let body = JSON.stringify({ email: '', password: 'P@ssw0rd123' })
    let req = new Request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    let res = await app.fetch(req as any)
    expect(res.status).toBeGreaterThanOrEqual(400) // 400 o 422 (validation error)
    
    // Test con contraseña vacía
    body = JSON.stringify({ email: mockSupabaseUser.email, password: '' })
    req = new Request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    res = await app.fetch(req as any)
    expect(res.status).toBeGreaterThanOrEqual(400)

    // Test con ambos vacíos
    body = JSON.stringify({ email: '', password: '' })
    req = new Request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    res = await app.fetch(req as any)
    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})
