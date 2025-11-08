import { describe, it, expect, beforeAll } from 'vitest';

/**
 * TestRail Case ID: C38
 * Title: CP-001: Registro de nuevo usuario
 * Type: Functional
 * Priority: Critical
 * Automation Type: Ranorex
 * Is Automated: Yes
 * Reference: RF-001 Autenticación
 * 
 * Precondiciones:
 * - Usuario no registrado previamente
 * - Base de datos Supabase disponible
 * 
 * Steps:
 * 1. Acceder a página de registro /register → Usuario creado en Supabase
 * 2. Ingresar email válido (ej: test@example.com) → Redirección a página de verificación de email
 * 3. Ingresar contraseña segura (min 8 chars, mayúsculas, números, símbolos) → Acceso realizado con éxito
 * 4. Confirmar contraseña → Contraseña confirmada
 * 5. Aceptar términos y condiciones
 * 6. Hacer clic en "Registrar" → Redirección a la página principal con el registro realizado correctamente
 */
describe.skip('C38: CP-001: Registro de nuevo usuario (Integration Tests - Skipped)', () => {
  
  // Datos de prueba
  const validUser = {
    email: 'test-' + Date.now() + '@example.com', // Email único
    password: 'P@ssw0rd123',
    confirmPassword: 'P@ssw0rd123'
  };

  it('Step 1-6: Flujo completo de registro exitoso', async () => {
    // NOTA: Este test requiere el servidor corriendo
    // Simula una petición POST a tu endpoint
    const response = await fetch('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validUser)
    });

    const data = await response.json();

    // Verificaciones según TestRail C38
    expect(response.status).toBe(201); // Usuario creado
    expect(data).toHaveProperty('userId');
    expect(data.emailVerified).toBe(false); // No verificado aún
    expect(data.message).toContain('verificación');
  });

  it('Step 3: Debe rechazar contraseña débil', async () => {
    const weakPassword = {
      email: 'weak-' + Date.now() + '@example.com',
      password: '123', // Contraseña débil
      confirmPassword: '123'
    };

    const response = await fetch('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(weakPassword)
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('contraseña');
  });

  it('Step 2: Debe rechazar email duplicado', async () => {
    // Primer registro
    await fetch('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validUser)
    });

    // Intento de duplicar
    const response = await fetch('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validUser)
    });

    expect(response.status).toBe(409); // Conflict
    const data = await response.json();
    expect(data.error).toContain('Email ya registrado');
  });

  it('Step 2: Debe rechazar email inválido', async () => {
    const invalidEmail = {
      email: 'no-es-un-email',
      password: 'P@ssw0rd123',
      confirmPassword: 'P@ssw0rd123'
    };

    const response = await fetch('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidEmail)
    });

    expect(response.status).toBe(400);
  });
});

// ========================================
// C38: Tests unitarios con mocks
// TestRail: CP-001: Registro de nuevo usuario
// Priority: Critical | Type: Functional | Automated: Yes
// ========================================
import { vi } from 'vitest'
import '../mocks/supabase.mock.js'
import { signupWithEmail } from '@/services/user.service.js'
import { mockSupabaseClient } from '../mocks/supabase.mock.js'

describe('C38: CP-001: Registro de nuevo usuario (Unit Tests)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * TestRail Step 1-6: Flujo completo de registro
   * Expected: Usuario creado en Supabase con redirección a verificación de email
   */
  it('C38-1: Debe registrar un usuario con datos válidos', async () => {
    const result = await signupWithEmail(
      'newuser@example.com',
      'P@ssw0rd123',
      {
        full_name: 'Test User',
        country: 'CO',
        role: 'cliente'
      }
    )

    expect(result.data).toBeDefined()
    expect(result.data?.user).toBeDefined()
    expect(mockSupabaseClient.auth.signUp).toHaveBeenCalled()
  })

  /**
   * TestRail Step 2: Validación de email duplicado
   * Expected: Error indicando que el email ya está registrado
   */
  it('C38-2: Debe rechazar email duplicado', async () => {
    // Mock para simular email existente
    vi.mocked(mockSupabaseClient.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'existing-id', is_deleted: false },
        error: null,
      }),
    } as any)

    await expect(
      signupWithEmail('existing@example.com', 'password', {})
    ).rejects.toThrow('en uso')
  })

  /**
   * TestRail Step 2: Validación de cuenta eliminada
   * Expected: Error indicando que la cuenta fue eliminada
   */
  it('C38-3: Debe rechazar cuenta eliminada', async () => {
    // Mock para simular cuenta eliminada
    vi.mocked(mockSupabaseClient.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'deleted-id', is_deleted: true },
        error: null,
      }),
    } as any)

    await expect(
      signupWithEmail('deleted@example.com', 'password', {})
    ).rejects.toThrow('deleted')
  })
});