/**
 * Rutas de autenticación para la aplicación Mercador
 *
 * Este módulo define todas las rutas relacionadas con autenticación de usuarios,
 * incluyendo registro, login, recuperación de contraseña, y gestión de sesiones.
 * Utiliza Supabase Auth para la autenticación y Zod para validación de datos.
 *
 * Funcionalidades implementadas:
 * - ✅ Registro de usuarios con validación de email y contraseña
 * - ✅ Login con email/contraseña y magic links
 * - ✅ Recuperación y actualización de contraseñas
 * - ✅ Verificación de email y códigos de verificación
 * - ✅ Logout y limpieza de sesiones
 * - ✅ Refresh de tokens JWT
 * - ✅ Manejo de cookies de sesión seguras
 * - ✅ Protección CSRF
 *
 * @module routes/auth
 *
 * @example
 * ```typescript
 * import authRoutes from './routes/auth'
 *
 * // Registrar rutas de autenticación
 * app.route('/auth', authRoutes)
 *
 * // Rutas disponibles:
 * // POST /auth/signup - Registro de usuario
 * // POST /auth/login - Login con email/contraseña
 * // POST /auth/magic-link - Login con magic link
 * // POST /auth/refresh - Refresh de token
 * // POST /auth/logout - Logout
 * // POST /auth/reset-password - Solicitar reset de contraseña
 * // POST /auth/update-password - Actualizar contraseña
 * // POST /auth/verify-email - Verificar email
 * // POST /auth/verify-code - Verificar código
 * ```
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import jwt from 'jsonwebtoken'
import { issueCsrfCookie } from '../middlewares/csrf.js'
// Renombrado para mayor claridad, asumiendo que user.service.js exporta las funciones de auth.ts
import * as userService from '../services/user.service.js'
import { clearCookie, clearSessionCookie } from '../services/user.service.js'
import { supabase } from '../config/supabase.js'
import { cookieToAuthHeader } from '../middlewares/cookieToAuthHeader.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'
import { logger } from '@/utils/logger.js'

const authRoutes = new OpenAPIHono()

// Helper: Extrae token desde Authorization header o cookie sb_access_token
function getTokenFromRequest(c: any): string | undefined {
  const authHeader = c.req.header('Authorization')
  let token = authHeader ? authHeader.replace('Bearer ', '') : undefined
  if (!token) {
    const cookie = c.req.header('cookie') ?? ''
    token = cookie.match(/(?:^|;\s*)sb_access_token=([^;]+)/)?.[1]
  }
  return token
}

// --- Zod Schemas ---

const SignupSchema = z.object({
  email: z.email(),
  password: z.string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*(),.?":{}|<>]).*$/,
      'La contraseña debe contener al menos una minúscula, una mayúscula y un carácter especial'),
  full_name: z.string().min(2, 'El nombre completo es requerido').optional(),
  country: z.string().optional(),
  rememberMe: z.boolean().optional(),
})

const UserResponseSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  full_name: z.string(),
  role: z.string(),
  image: z.string().url().optional(),
})

const LoginResponseSchema = z.object({
  success: z.boolean(),
  session: z.object({
    access_token: z.string(),
    refresh_token: z.string(),
    expires_in: z.number(),
    expires_at: z.number().optional(),
    token_type: z.string(),
    user: z.object({
      id: z.uuid(),
      email: z.email(),
      user_metadata: z.record(z.string(), z.any()),
    }).loose()
  }).loose()
})

const LoginSchema = z.object({
  email: z.email(),
  password: z.string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*(),.?":{}|<>]).*$/,
      'La contraseña debe contener al menos una minúscula, una mayúscula y un carácter especial'),
  restore: z.boolean().optional(),
})

const MagicLinkLoginSchema = z.object({
  email: z.email('Por favor, introduce un correo válido.'),
});

const RequestPasswordResetSchema = z.object({
  email: z.email('Por favor, introduce un correo válido.'),
});

const UpdatePasswordSchema = z.object({
  newPassword: z.string()
    .min(8, 'La nueva contraseña debe tener al menos 8 caracteres')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*(),.?":{}|<>]).*$/,
      'La nueva contraseña debe contener al menos una minúscula, una mayúscula y un carácter especial'),
});

// --- Helper para Cookies ---

const createSessionCookie = (accessToken: string): string => {
  let ttl = 3600; // 1 hora por defecto
  try {
    const decoded = jwt.decode(accessToken) as { exp?: number } | null;
    if (decoded?.exp) {
      const now = Math.floor(Date.now() / 1000);
      // Establece TTL para que expire 30s antes que el token real, max 6 horas
      ttl = Math.max(60, Math.min(decoded.exp - now - 30, 6 * 60 * 60));
    }
  } catch (err) {
    console.error("Failed to decode JWT:", err);
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const accessCookie = [
    `sb_access_token=${accessToken}`,
    `HttpOnly`,
    `Path=/`,
    `Max-Age=${ttl}`,
    `SameSite=Lax`,
    isProduction ? 'Secure' : ''
  ].filter(Boolean).join('; ')

  return accessCookie
}



// --- Rutas de Autenticación ---

// 🚀 1. Signup
const signupRoute = createRoute({
  method: 'post',
  path: '/register',
  request: {
    body: {
      content: {
        'application/json': {
          schema: SignupSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Usuario registrado exitosamente',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            data: z.any(),
          }),
        },
      },
    },
    400: {
      description: 'Error de validación o registro',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            error: z.string(),
          }),
        },
      },
    },
  },
})

authRoutes.openapi(signupRoute, async (c) => {
  const body = c.req.valid('json')
  const { email, password, full_name, country } = body

  try {
    const { data } = await userService.signupWithEmail(email, password, { full_name, country });
    return c.json({ success: true, data }, 201)
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
    return c.json({ success: false, error: errorMessage }, 400)
  }
})

// 🚀 2. Login (Email/Password)
const loginRoute = createRoute({
  method: 'post',
  path: '/login',
  request: { body: { content: { 'application/json': { schema: LoginSchema } }, required: true } },
  responses: {
    200: { description: 'Login exitoso', content: { 'application/json': { schema: LoginResponseSchema } } },
    401: { description: 'Credenciales inválidas' }
  }
})

authRoutes.openapi(loginRoute, async (c) => {
  try {
    const body = c.req.valid('json');
    // Si el frontend envía restore=true, intentar restaurar la cuenta antes de login
    if (body.restore === true) {
      // Buscar usuario por email
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', body.email)
        .single();
      if (userProfile?.id) {
        await userService.restoreUser(userProfile.id);
      }
    }

    const result = await userService.loginWithEmail(body.email, body.password);

    // Si la cuenta está eliminada, devolver flag especial
    if (result.accountDeleted) {
      return c.json({
        success: false,
        accountDeleted: true,
        message: 'La cuenta está eliminada. ¿Desea restaurarla y continuar?',
      }, 403);
    }

    if (!result.session) throw new Error('No se pudo iniciar sesión');

    // Si requiere MFA, devolver respuesta especial sin cookies de sesión completa
    if (result.mfaRequired) {
      return c.json({
        success: true,
        mfaRequired: true,
        factorId: result.factorId,
        // Devolver un token temporal para completar la verificación MFA
        tempToken: result.session.access_token
      }, 200);
    }

    // Login completo sin MFA
    const sessionCookie = createSessionCookie(result.session.access_token);
    const isProduction = process.env.NODE_ENV === 'production'
    const refreshCookie = [
      `sb_refresh_token=${result.session.refresh_token}`,
      `HttpOnly`,
      `Path=/auth`,
      `Max-Age=${60 * 60 * 24 * (parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '7', 10) || 7)}`,
      isProduction ? 'Secure' : '',
      `SameSite=Lax`
    ].filter(Boolean).join('; ')
    // Ensure any stale access cookie scoped to /auth is cleared (prevents duplicate sb_access_token entries)
    const clearAccessAuth = [
      `sb_access_token=;`,
      `HttpOnly`,
      `Path=/auth`,
      `Max-Age=0`,
      isProduction ? 'Secure' : '',
      `SameSite=Lax`
    ].filter(Boolean).join('; ')

    return c.json({
      success: true,
      session: result.session
    }, 200, {
      'Set-Cookie': [sessionCookie, refreshCookie, clearAccessAuth],
    });
  } catch (err) {
    logger.error(err);
    return c.json({ success: false, error: 'Email o contraseña incorrectos' }, 401);
  }
});

// 🚀 3. Login con Magic Link
const magicLinkRoute = createRoute({
  method: 'post',
  path: '/login/magiclink',
  request: { body: { content: { 'application/json': { schema: MagicLinkLoginSchema } }, required: true } },
  responses: {
    200: { description: 'Enlace de inicio de sesión enviado', content: { 'application/json': { schema: z.object({ success: z.boolean(), message: z.string() }) } } },
    400: { description: 'Error en la petición' },
  },
});

authRoutes.openapi(magicLinkRoute, async (c) => {
  try {
    const { email } = c.req.valid('json');
    await userService.loginWithMagicLink(email);
    return c.json({ success: true, message: 'Revisa tu correo para el enlace de inicio de sesión.' }, 200);
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 400);
  }
});



// 🚀 6. Logout
const logoutRoute = createRoute({
  method: 'post',
  path: '/logout',
  responses: {
    200: { description: 'Logout exitoso', content: { 'application/json': { schema: z.object({ success: z.boolean(), message: z.string() }) } } },
  }
})

authRoutes.openapi(logoutRoute, async (c) => {
  // La invalidación del token la maneja Supabase en el cliente.
  // Aquí, lo importante es eliminar la cookie HttpOnly del navegador.
  const cookie = clearSessionCookie();
  // Clear refresh cookie as well
  const isProduction = process.env.NODE_ENV === 'production'
  const clearRefresh = [
    `sb_refresh_token=;`,
    `HttpOnly`,
    `Path=/auth`,
    `Max-Age=0`,
    isProduction ? 'Secure' : '',
    `SameSite=Lax`
  ].filter(Boolean).join('; ')

  // Also clear any sb_access_token that might be scoped to /auth (duplicates)
  const clearAccessAuth = [
    `sb_access_token=;`,
    `HttpOnly`,
    `Path=/auth`,
    `Max-Age=0`,
    isProduction ? 'Secure' : '',
    `SameSite=Lax`
  ].filter(Boolean).join('; ')

  // Attempt to revoke refresh token in Redis if provided by client
  try {
    const cookieHeader = c.req.header('cookie') ?? ''
    const rt = cookieHeader.match(/(?:^|;\s*)sb_refresh_token=([^;]+)/)?.[1]
    if (rt) {
      await userService.revokeRefreshToken(rt)
    }
  } catch (e) {
    // ignore
  }

  return c.json({ success: true, message: 'Sesión cerrada exitosamente' }, 200, {
    'Set-Cookie': [cookie, clearRefresh, clearAccessAuth],
  });
});

// 🚀 7. Pedir reseteo de contraseña
const requestPasswordResetRoute = createRoute({
  method: 'post',
  path: '/password/reset',
  request: { body: { content: { 'application/json': { schema: RequestPasswordResetSchema } }, required: true } },
  responses: {
    200: { description: 'Correo de reseteo enviado', content: { 'application/json': { schema: z.object({ success: z.boolean(), message: z.string() }) } } },
    400: { description: 'Error en la petición' },
  },
});

authRoutes.openapi(requestPasswordResetRoute, async (c) => {
  try {
    const { email } = c.req.valid('json');
    await userService.requestPasswordReset(email);
    return c.json({ success: true, message: 'Si el correo existe, recibirás un enlace para resetear tu contraseña.' }, 200);
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 400);
  }
});

// 🚀 8. Actualizar contraseña (requiere autenticación)
const updatePasswordRoute = createRoute({
  method: 'post',
  path: '/password/update',
  security: [{ Bearer: [] }], // Indica que es una ruta protegida
  request: { body: { content: { 'application/json': { schema: UpdatePasswordSchema } }, required: true } },
  responses: {
    200: { description: 'Contraseña actualizada', content: { 'application/json': { schema: z.object({ success: z.boolean(), message: z.string() }) } } },
    401: { description: 'No autenticado' },
    400: { description: 'Error en la petición' },
  },
});

// Aplica los middlewares para validar la sesión
authRoutes.use('/password/update', cookieToAuthHeader);
authRoutes.use('/password/update', authMiddleware);

authRoutes.openapi(updatePasswordRoute, async (c) => {
  try {
    // El authMiddleware ya validó el token y puso userId en el contexto
    const userId = c.get('userId') as string;
    const token = getTokenFromRequest(c);
    
    if (!userId || !token) {
      return c.json({ success: false, error: 'No autenticado' }, 401);
    }
    
    const { newPassword } = c.req.valid('json');
    await userService.updatePassword(token, newPassword);
    return c.json({ success: true, message: 'Tu contraseña ha sido actualizada.' }, 200);
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 400);
  }
});



// 🚀 9. Obtener perfil del usuario actual (ruta protegida)
const meRoute = createRoute({
  method: 'get',
  path: '/me',
  security: [{ Bearer: [] }],
  responses: {
    200: { description: 'Perfil del usuario', content: { 'application/json': { schema: z.object({ success: z.boolean(), data: UserResponseSchema }) } } },
    401: { description: 'No autenticado' },
  }
})

// El middleware cookieToAuthHeader y authMiddleware se aplican globalmente en index.ts
authRoutes.openapi(meRoute, async (c) => {
  try {
    // El authMiddleware ya validó el token y puso userId en el contexto
    const userId = c.get('userId') as string;
    
    if (!userId) {
      return c.json({ success: false, error: 'No autenticado' }, 401);
    }
    
    // Extraer token para la consulta autenticada
    const token = getTokenFromRequest(c);
    
    const userProfile = await userService.getUserById(userId, token);
    return c.json({ success: true, data: userProfile });
  } catch (err) {
    console.error('Error fetching user profile:', err);
    return c.json({ success: false, error: 'No se pudo obtener el perfil del usuario' }, 401);
  }
});



const refreshRoute = createRoute({
  method: 'post',
  path: '/refresh',
  responses: { 200: { description: 'OK' }, 401: { description: 'No refresh token' } }
})

authRoutes.openapi(refreshRoute, async (c) => {
  const cookie = c.req.header('cookie') ?? ''
  const rt = cookie.match(/(?:^|;\s*)sb_refresh_token=([^;]+)/)?.[1]
  if (!rt) return c.json({ success: false, error: 'No refresh token' }, 401)

  try {
    const session = await userService.refreshSession(rt)
    const access = session?.access_token!
    const refresh = session?.refresh_token!
    const accessCookie = createSessionCookie(access) // cookie de acceso con Path=/
    const isProduction = process.env.NODE_ENV === 'production'
    const refreshCookie = [
      `sb_refresh_token=${refresh}`,
      `HttpOnly`,
      `Path=/auth`,
      `Max-Age=${60 * 60 * 24 * (parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '7', 10) || 7)}`,
      isProduction ? 'Secure' : '',
      `SameSite=Lax`
    ].filter(Boolean).join('; ')

    // Clear any stale sb_access_token set with Path=/auth to avoid duplicates
    const clearAccessAuth = [
      `sb_access_token=;`,
      `HttpOnly`,
      `Path=/auth`,
      `Max-Age=0`,
      isProduction ? 'Secure' : '',
      `SameSite=Lax`
    ].filter(Boolean).join('; ')

    const csrf = issueCsrfCookie()
    return c.json({ success: true }, 200, {
      'Set-Cookie': [accessCookie, refreshCookie, clearAccessAuth, csrf],
    })
  } catch (e) {
    return c.json({ success: false, error: 'Refresh failed' }, 401)
  }
})

// 🚀 Establecer sesión desde token (para confirmación de email y recovery)
const sessionRoute = createRoute({
  method: 'post',
  path: '/session',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            access_token: z.string(),
            refresh_token: z.string().optional()
          })
        }
      }, required: true
    }
  },
  responses: {
    200: { description: 'Sesión establecida correctamente' },
    401: { description: 'Token inválido' }
  }
})

authRoutes.openapi(sessionRoute, async (c) => {
  const { access_token, refresh_token } = c.req.valid('json')

  try {
    // Validar el access_token con Supabase
    const { data: userData, error: userError } = await userService.getUserByAccessToken(access_token)
    if (userError || !userData?.user) {
      console.error('[Session] Token inválido:', userError?.message)
      return c.json({ success: false, error: 'Token inválido o expirado' }, 401)
    }

    console.log('[Session] Token validado para usuario:', userData.user.id)

    // Decodificar el token para obtener el expires_in
    let expiresIn = 3600 // default 1 hora
    try {
      const decoded = jwt.decode(access_token) as { exp?: number } | null
      if (decoded?.exp) {
        const now = Math.floor(Date.now() / 1000)
        expiresIn = Math.max(60, decoded.exp - now)
      }
    } catch (err) {
      console.error('[Session] Error decodificando JWT:', err)
    }

    // Guardar la sesión en Redis
    const redisService = await import('../services/redis.service.js')
    await redisService.redisService.set(`session:${access_token}`, userData.user.id, expiresIn)
    console.log('[Session] Sesión guardada en Redis para usuario:', userData.user.id)

    // Guardar refresh token si está presente
    if (refresh_token) {
      const refreshTtlSeconds = (parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '7', 10) || 7) * 24 * 60 * 60
      await redisService.redisService.set(`refresh:${refresh_token}`, userData.user.id, refreshTtlSeconds)
      console.log('[Session] Refresh token guardado en Redis')
    }

    // Establecer cookies de sesión
    const accessCookie = createSessionCookie(access_token)
    const isProduction = process.env.NODE_ENV === 'production'
    
    const cookies = [accessCookie]
    
    if (refresh_token) {
      const refreshCookie = [
        `sb_refresh_token=${refresh_token}`,
        `HttpOnly`,
        `Path=/auth`,
        `Max-Age=${60 * 60 * 24 * (parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '7', 10) || 7)}`,
        isProduction ? 'Secure' : '',
        `SameSite=Lax`
      ].filter(Boolean).join('; ')
      cookies.push(refreshCookie)
    }

    // Limpiar posibles cookies duplicadas
    const clearAccessAuth = [
      `sb_access_token=;`,
      `HttpOnly`,
      `Path=/auth`,
      `Max-Age=0`,
      isProduction ? 'Secure' : '',
      `SameSite=Lax`
    ].filter(Boolean).join('; ')
    cookies.push(clearAccessAuth)

    const csrf = issueCsrfCookie()
    cookies.push(csrf)
    
    console.log('[Session] ✅ Sesión establecida correctamente')
    return c.json({ 
      success: true, 
      message: 'Sesión establecida correctamente',
      user: userData.user 
    }, 200, {
      'Set-Cookie': cookies,
    })
  } catch (err) {
    console.error('[Session] Error estableciendo sesión:', err)
    const errorMessage = err instanceof Error ? err.message : 'Error inesperado'
    return c.json({ success: false, error: errorMessage }, 500)
  }
})



// 🔐 MFA Routes

// Enroll MFA (configurar por primera vez)
const enrollMfaRoute = createRoute({
  method: 'post',
  path: '/mfa/enroll',
  security: [{ Bearer: [] }],
  responses: { 200: { description: 'Factor TOTP enrolado' } }
})
authRoutes.openapi(enrollMfaRoute, async (c) => {
  const token = getTokenFromRequest(c)
  if (!token) return c.json({ success: false, error: 'No autenticado' }, 401)
  const resp = await userService.enrollMfa(token)
  if (resp.error) return c.json({ success: false, error: resp.error.message }, 400)
  return c.json({ 
    success: true, 
    factorId: resp.data.id, 
    qrCode: resp.data.totp.qr_code,
    secret: resp.data.totp.secret,
    uri: resp.data.totp.uri 
  })
})

// Verify MFA durante configuración inicial
const verifyMfaSetupRoute = createRoute({
  method: 'post',
  path: '/mfa/verify',
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            factorId: z.string(),
            code: z.string()
          })
        }
      }, required: true
    }
  },
  responses: { 200: { description: 'Factor verificado y activado' } }
})
authRoutes.openapi(verifyMfaSetupRoute, async (c) => {
  const { factorId, code } = c.req.valid('json')
  const token = getTokenFromRequest(c)
  if (!token) return c.json({ success: false, error: 'No autenticado' }, 401)

  const { data, error } = await userService.verifyMFA(token, factorId, code)
  if (error) return c.json({ success: false, error: error.message }, 400)

  return c.json({ success: true, message: 'MFA activado correctamente' })
})

// Verify MFA durante login (completar autenticación)
const verifyMfaLoginRoute = createRoute({
  method: 'post',
  path: '/mfa/verify-login',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            factorId: z.string(),
            code: z.string(),
            tempToken: z.string()
          })
        }
      }, required: true
    }
  },
  responses: { 200: { description: 'Login completado después de MFA' } }
})
authRoutes.openapi(verifyMfaLoginRoute, async (c) => {
  const { factorId, code, tempToken } = c.req.valid('json')

  try {
    // Verificar el código MFA
    const { data, error } = await userService.verifyMFA(tempToken, factorId, code)

    if (error) {
      return c.json({ success: false, error: error.message }, 401)
    }

    // Decodificar el token para obtener información de sesión
    const decoded = jwt.decode(tempToken) as any
    if (!decoded) {
      throw new Error('Invalid token')
    }

    // Validar que todos los campos requeridos estén presentes
    if (!data?.access_token || !data?.refresh_token || !data?.user?.id) {
      const missingFields = [];
      if (!data?.access_token) missingFields.push('access_token');
      if (!data?.refresh_token) missingFields.push('refresh_token');
      if (!data?.user?.id) missingFields.push('user.id');
      
      throw new Error(`Missing required fields in MFA response: ${missingFields.join(', ')}`);
    }

    // Usar directamente los datos de la verificación MFA exitosa
    const sessionData = {
      session: {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        user: data.user,
        expires_in: data.expires_in || 3600
      }
    }

    // Completar el login en Redis
    await userService.completeMFALogin(
      sessionData.session.access_token,
      sessionData.session.refresh_token,
      sessionData.session.user.id,
      sessionData.session.expires_in,
      tempToken
    )

    // Crear cookies de sesión
    const sessionCookie = createSessionCookie(sessionData.session.access_token)
    const isProduction = process.env.NODE_ENV === 'production'
    const refreshCookie = [
      `sb_refresh_token=${sessionData.session.refresh_token}`,
      `HttpOnly`,
      `Path=/auth`,
      `Max-Age=${60 * 60 * 24 * (parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '7', 10) || 7)}`,
      isProduction ? 'Secure' : '',
      `SameSite=Lax`
    ].filter(Boolean).join('; ')
    const clearAccessAuth = [
      `sb_access_token=;`,
      `HttpOnly`,
      `Path=/auth`,
      `Max-Age=0`,
      isProduction ? 'Secure' : '',
      `SameSite=Lax`
    ].filter(Boolean).join('; ')

    return c.json({
      success: true,
      session: sessionData.session
    }, 200, {
      'Set-Cookie': [sessionCookie, refreshCookie, clearAccessAuth],
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Error inesperado'
    return c.json({ success: false, error: errorMessage }, 500)
  }
})

// Unenroll MFA (desactivar)
const unenrollMfaRoute = createRoute({
  method: 'delete',
  path: '/mfa/unenroll',
  security: [{ Bearer: [] }],
  request: {},
  responses: { 200: { description: 'Factor MFA eliminado' } }
})
authRoutes.openapi(unenrollMfaRoute, async (c) => {
  const token = getTokenFromRequest(c)
  if (!token) return c.json({ success: false, error: 'No autenticado' }, 401)
  const { data: factorsData, error: factorsError } = await userService.listMFAFactors(token)

  if (factorsError) return c.json({ success: false, error: factorsError.message }, 400)
  if (!factorsData || factorsData.all.length === 0) {
    return c.json({ success: false, error: 'No hay factores MFA para eliminar' }, 400)
  }
  const factorId = factorsData.all[0].id // Asumimos que solo hay un factor y tomamos el primero
  const { data, error } = await userService.unenrollMFA(token, factorId)
  if (error) return c.json({ success: false, error: error.message }, 400)

  return c.json({ success: true, message: 'MFA desactivado correctamente' })
})

// List MFA factors
const listMfaRoute = createRoute({
  method: 'get',
  path: '/mfa/factors',
  security: [{ Bearer: [] }],
  responses: { 200: { description: 'Lista de factores MFA' } }
})
authRoutes.openapi(listMfaRoute, async (c) => {
  const token = getTokenFromRequest(c)
  if (!token) return c.json({ success: false, error: 'No autenticado' }, 401)

  const { data, error } = await userService.listMFAFactors(token)
  if (error) return c.json({ success: false, error: error.message }, 400)

  return c.json({ success: true, factors: data.all })
})
export default authRoutes;
