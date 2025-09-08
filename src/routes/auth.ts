import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import jwt from 'jsonwebtoken'
import { issueCsrfCookie } from '../middlewares/csrf.js'
// Renombrado para mayor claridad, asumiendo que user.service.js exporta las funciones de auth.ts
import * as userService from '../services/user.service.js'
import { clearCookie, clearSessionCookie } from '../services/user.service.js'
import { cookieToAuthHeader } from '../middlewares/cookieToAuthHeader.js';

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
  full_name: z.string().min(2, 'El nombre completo es requerido'),
  country: z.string().optional(),
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
  path: '/signup',
  request: { body: { content: { 'application/json': { schema: SignupSchema } }, required: true } },
  responses: {
    201: { description: 'Usuario creado', content: { 'application/json': { schema: z.object({ success: z.boolean(), data: UserResponseSchema }) } } },
    400: { description: 'Error en la petición' },
    409: { description: 'El correo ya está en uso' }
  }
})

authRoutes.openapi(signupRoute, async (c) => {
  try {
    const body = c.req.valid('json');
    const { data, error } = await userService.signupWithEmail(body.email, body.password, body);

    // Manejo robusto de error: Supabase devuelve un objeto error, no siempre una instancia de Error
    if (error) {
      const msg = (error as any)?.message ?? JSON.stringify(error);
      if (typeof msg === 'string' && msg.includes('already registered')) {
        return c.json({ success: false, error: 'Este correo ya está en uso' }, 409);
      }
      return c.json({ success: false, error: msg }, 400);
    }

    if (!data || !data.user) {
      return c.json({ success: false, error: 'No se pudo crear el usuario' }, 400);
    }

    return c.json({
      success: true,
      data: data
    }, 201);
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message }, 400);
  }
});


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
    const { session } = await userService.loginWithEmail(body.email, body.password);

    if (!session) throw new Error('No se pudo iniciar sesión');

    const sessionCookie = createSessionCookie(session.access_token);
    const isProduction = process.env.NODE_ENV === 'production'
    const refreshCookie = [
      `sb_refresh_token=${session.refresh_token}`,
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
    const origin = c.req.header('Origin') || '';

    return c.json({
      success: true,
      session: session
    }, 200, {
      'Set-Cookie': [sessionCookie, refreshCookie, clearAccessAuth],
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Origin': origin,
    });
  } catch (err) {
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

  const origin = c.req.header('Origin') || '';
  return c.json({ success: true, message: 'Sesión cerrada exitosamente' }, 200, {
    'Set-Cookie': [cookie, clearRefresh, clearAccessAuth],
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Origin': origin,
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

authRoutes.openapi(updatePasswordRoute, async (c) => {
  try {
    // Asume que un middleware ya verificó la sesión y el usuario está autenticado
    const { newPassword } = c.req.valid('json');
    await userService.updatePassword(newPassword);
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

// Aplica el middleware que copia la cookie a Authorization antes del authMiddleware
authRoutes.use('/me', cookieToAuthHeader);
authRoutes.openapi(meRoute, async (c) => {
  try {
    // Se asume que un middleware previo ha validado el token y ha puesto el 'userId' en el contexto
    let userId = c.get('userId') as string | undefined;
    let token: string | undefined;
    if (!userId) {
      // Fallback: intentar obtener token desde header o cookie y validar con Supabase
  token = getTokenFromRequest(c)
  if (!token) return c.json({ success: false, error: 'No autenticado' }, 401)

      const { data, error } = await userService.getUserByAccessToken(token)
      if (error || !data?.user) return c.json({ success: false, error: 'No autenticado' }, 401)
      userId = data.user.id
      c.set('userId', userId)
    } else {
      // Extract token for the query
  token = getTokenFromRequest(c)
    }
    const userProfile = await userService.getUserById(userId, token);
    return c.json({ success: true, data: userProfile });
  } catch (err) {
    console.error('Error fetching user profile:', err);
    return c.json({ success: false, error: 'No se pudo obtener el perfil del usuario' }, 500);
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
    const origin = c.req.header('Origin') || '';
    return c.json({ success: true }, 200, {
      'Set-Cookie': [accessCookie, refreshCookie, clearAccessAuth, csrf],
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Origin': origin,
    })
  } catch (e) {
    return c.json({ success: false, error: 'Refresh failed' }, 401)
  }
})



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
  if (resp.error) return c.json({ success: false, error: resp.error }, 400)
  return c.json({ ok: true, factorId: resp.data.id, uri: resp.data.totp.uri })
})

const verifyMfaRoute = createRoute({
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
  responses: { 200: { description: 'Factor verificado' } }
})
authRoutes.openapi(verifyMfaRoute, async (c) => {
  const token = getTokenFromRequest(c)
  if (!token) return c.json({ success: false, error: 'No autenticado' }, 401)
  const { factorId, code } = c.req.valid('json')
  const resp = await userService.verifyMFA(token, factorId, code)
  return c.json(resp)
})

authRoutes.openapi(enrollMfaRoute, async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return c.json({ success: false, error: 'No autenticado' }, 401)

  const { data, error } = await userService.enrollMfa(token);
  if (error) return c.json({ success: false, error: error.message }, 400);

  // Supabase MFA enroll returns `data.totp.qr_code` (and `.uri`) inside the response
  return c.json({ success: true, qr_code: data?.totp?.qr_code ?? data?.totp?.uri, factor_id: data?.id });
});

authRoutes.openapi(verifyMfaRoute, async (c) => {
  const { factorId, code } = c.req.valid('json');
  const token = getTokenFromRequest(c)
  if (!token) return c.json({ success: false, error: 'No autenticado' }, 401)

  const { data, error } = await userService.verifyMFA(token, factorId, code);
  if (error) return c.json({ success: false, error: (error as any)?.message ?? 'MFA verification failed' }, 400);

  return c.json({ success: true, message: 'MFA activada correctamente', data });
});


export default authRoutes;
