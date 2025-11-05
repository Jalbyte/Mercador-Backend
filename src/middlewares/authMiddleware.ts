import type { Context, Next } from 'hono'
import { supabase } from '../config/supabase.js'
import { initRedis } from '../config/redis.js'
import { pino } from 'pino'
import { LOG_LEVEL } from '../config/env.js'
import jwt from 'jsonwebtoken'

/**
 * Middleware de autenticación avanzado con caching Redis
 *
 * Este módulo proporciona middlewares de autenticación que incluyen:
 * - Validación de tokens JWT con Supabase
 * - Caching de usuarios en Redis para mejorar rendimiento
 * - Soporte para autenticación requerida y opcional
 * - Extracción de tokens desde headers Authorization o cookies
 *
 * @module middlewares/authMiddleware
 */

const logger = pino({ level: LOG_LEVEL })

/**
 * Estructura de usuario cacheado en Redis
 *
 * Contiene la información básica del usuario almacenada en cache
 * para evitar consultas repetidas a Supabase.
 */
type CachedUser = {
  /** ID único del usuario */
  id: string
  /** Email del usuario (puede ser null) */
  email: string | null
  /** Rol del usuario (opcional, por defecto 'cliente') */
  role?: string
  /** Indica si la cuenta está eliminada (soft delete) */
  is_deleted?: boolean
}

/**
 * Calcula el tiempo de vida restante de un token JWT
 *
 * Analiza el token JWT para determinar cuánto tiempo le queda de vida
 * y calcula un TTL apropiado para el cache, con un buffer de seguridad.
 *
 * @param token - Token JWT a analizar
 * @returns Tiempo de vida en segundos (mínimo 60s, máximo 6 horas)
 *
 * @example
 * ```typescript
 * const ttl = getTokenTTLSeconds(token) // Retorna tiempo restante en segundos
 * ```
 */
function getTokenTTLSeconds(token: string): number {
  try {
    const decoded = jwt.decode(token) as { exp?: number } | null
    if (decoded?.exp) {
      const nowSec = Math.floor(Date.now() / 1000)
      // Leave a 30s buffer; clamp between 60s and 6h
      return Math.max(60, Math.min(decoded.exp - nowSec - 30, 6 * 60 * 60))
    }
  } catch {}
  // Fallback TTL: 5 minutes
  return 5 * 60
}

/**
 * Obtiene un usuario desde el cache de Redis
 *
 * Busca la información del usuario en Redis usando el token como clave.
 * Si el usuario está en cache, evita la consulta a Supabase.
 *
 * @param token - Token JWT del usuario
 * @returns Información del usuario cacheado o null si no existe
 *
 * @example
 * ```typescript
 * const cachedUser = await getCachedUser(token)
 * if (cachedUser) {
 *   // Usar datos del cache
 * }
 * ```
 */
async function getCachedUser(token: string): Promise<CachedUser | null> {
  try {
    const client = await initRedis(logger)
    const raw = await client.get(`auth:token:${token}`)
    return raw ? (JSON.parse(raw) as CachedUser) : null
  } catch (err) {
    logger.debug({ err }, 'Redis get cache failed (auth)')
    return null
  }
}

/**
 * Almacena la información de un usuario en el cache de Redis
 *
 * Guarda la información del usuario en Redis con un TTL basado
 * en la expiración del token JWT.
 *
 * @param token - Token JWT del usuario (usado como clave)
 * @param user - Información del usuario a cachear
 * @param ttlSeconds - Tiempo de vida en segundos
 *
 * @example
 * ```typescript
 * await setCachedUser(token, userData, 300) // Cache por 5 minutos
 * ```
 */
async function setCachedUser(token: string, user: CachedUser, ttlSeconds: number): Promise<void> {
  try {
    const client = await initRedis(logger)
    await client.setEx(`auth:token:${token}`, ttlSeconds, JSON.stringify(user))
  } catch (err) {
    logger.debug({ err }, 'Redis set cache failed (auth)')
  }
}

/**
 * Middleware de autenticación requerida con caching
 *
 * Valida que el usuario esté autenticado y cachea la información del usuario
 * en Redis para mejorar el rendimiento de requests subsiguientes. Extrae
 * el token desde el header Authorization o la cookie `sb_access_token`.
 *
 * @param c - Contexto de Hono
 * @param next - Función para continuar con el siguiente middleware
 * @returns Respuesta JSON con error 401 si la autenticación falla
 *
 * @example
 * ```typescript
 * import { authMiddleware } from './middlewares/authMiddleware'
 *
 * app.get('/api/profile', authMiddleware, async (c) => {
 *   const userId = c.get('userId')
 *   const userEmail = c.get('userEmail')
 *   const userRole = c.get('userRole')
 *   // ... lógica de la ruta
 * })
 * ```
 */
export async function authMiddleware(c: Context, next: Next) {
  try {
    let token: string | undefined
    const authHeader = c.req.header('Authorization')

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.replace('Bearer ', '').trim()
    } else {
      const cookieHeader = c.req.header('Cookie')
      if (cookieHeader) {
        const cookies = cookieHeader.split(';').map(c => c.trim().split('='))
        const sbCookie = cookies.find(([name]) => name === 'sb_access_token')
        if (sbCookie) {
          token = sbCookie[1]
        }
      }
    }

    if (!token) {
      return c.json({ success: false, error: 'Missing or invalid token' }, 401)
    }

    // Try cache first
    const cached = await getCachedUser(token)
    if (cached) {
      // Si el usuario está soft deleted, denegar acceso
      if ((cached as any).is_deleted === true) {
        return c.json({ success: false, error: 'Cuenta eliminada. Debe restaurar su cuenta para acceder.' }, 403)
      }
      c.set('userId', cached.id)
      c.set('userEmail', cached.email ?? undefined)
      c.set('userRole', cached.role ?? 'cliente')
      await next()
      return
    }

    // Verify the token with Supabase
    const { data, error } = await supabase.auth.getUser(token)

    if (error || !data.user) {
      return c.json({ success: false, error: 'Invalid or expired token' }, 401)
    }

    // Consultar is_deleted en la base de datos
    let isDeleted = false;
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_deleted')
        .eq('id', data.user.id)
        .single();
      isDeleted = profile?.is_deleted === true;
    } catch (e) {
      // Si falla la consulta, por seguridad denegar acceso
      return c.json({ success: false, error: 'No se pudo verificar el estado de la cuenta' }, 403);
    }
    // Cachear el estado de is_deleted junto con el usuario
    const ttl = getTokenTTLSeconds(token)
    await setCachedUser(token, {
      id: data.user.id,
      email: data.user.email ?? null,
      role: data.user.user_metadata?.role ?? 'cliente',
      is_deleted: isDeleted
    }, ttl)
    if (isDeleted) {
      return c.json({ success: false, error: 'Cuenta eliminada. Debe restaurar su cuenta para acceder.' }, 403)
    }
    // Guardar datos en el contexto
    c.set('userId', data.user.id)
    c.set('userEmail', data.user.email)
    c.set('userRole', data.user.user_metadata?.role ?? 'cliente')

    await next()
  } catch (err) {
    return c.json(
      { success: false, error: err instanceof Error ? err.message : 'Auth failed' },
      401
    )
  }
}

/**
 * Middleware de autenticación opcional con caching
 *
 * Similar al middleware requerido pero no lanza errores si no hay token.
 * Si se proporciona un token válido, valida con Supabase y cachea la información.
 * Útil para rutas que funcionan tanto para usuarios autenticados como anónimos.
 *
 * @param c - Contexto de Hono
 * @param next - Función para continuar con el siguiente middleware
 *
 * @example
 * ```typescript
 * import { optionalAuthMiddleware } from './middlewares/authMiddleware'
 *
 * app.get('/api/products', optionalAuthMiddleware, async (c) => {
 *   const userId = c.get('userId') // Puede ser undefined
 *   const isAuthenticated = !!userId
 *
 *   if (isAuthenticated) {
 *     // Personalizar respuesta para usuarios autenticados
 *   }
 *   // Continuar con lógica normal
 * })
 * ```
 */
export async function optionalAuthMiddleware(c: Context, next: Next) {
  try {
    let token: string | undefined
    const authHeader = c.req.header('Authorization')

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.replace('Bearer ', '').trim()
    } else {
      const cookieHeader = c.req.header('Cookie')
      if (cookieHeader) {
        const cookies = cookieHeader.split(';').map(c => c.trim().split('='))
        const sbCookie = cookies.find(([name]) => name === 'sb_access_token')
        if (sbCookie) {
          token = sbCookie[1]
        }
      }
    }

    if (token) {
      const cached = await getCachedUser(token)
      if (cached) {
        c.set('userId', cached.id)
        c.set('userEmail', cached.email ?? undefined)
        c.set('userRole', cached.role ?? 'cliente')
      } else {
        const { data, error } = await supabase.auth.getUser(token)
        if (!error && data.user) {
          const ttl = getTokenTTLSeconds(token)
          await setCachedUser(token, {
            id: data.user.id,
            email: data.user.email ?? null,
            role: data.user.user_metadata?.role ?? 'cliente'
          }, ttl)
          c.set('userId', data.user.id)
          c.set('userEmail', data.user.email)
          c.set('userRole', data.user.user_metadata?.role ?? 'cliente')
        }
      }
    }

    await next()
  } catch (err) {
    // Do not fail the request on optional auth errors
    await next()
  }
}
