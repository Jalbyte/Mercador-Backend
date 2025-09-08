import type { MiddlewareHandler } from 'hono'
import * as userService from '../services/user.service.js'
import { AuthenticationError } from '../utils/errors.js'

/**
 * Middlewares de autenticación para la aplicación Mercador
 *
 * Este módulo proporciona middlewares para manejar la autenticación de usuarios
 * en las rutas de la API. Soporta tanto autenticación requerida como opcional,
 * y maneja tokens JWT de Supabase a través de headers Authorization o cookies.
 *
 * @module middlewares/auth
 */

/**
 * Payload del token JWT decodificado
 *
 * Contiene la información básica del usuario extraída del token JWT
 * después de la validación.
 */
interface JWTPayload {
  /** ID único del usuario */
  userId: string
  /** Email del usuario */
  email: string
  /** Timestamp de emisión del token (opcional) */
  iat?: number
  /** Timestamp de expiración del token (opcional) */
  exp?: number
}

/**
 * Middleware de autenticación requerida
 *
 * Este middleware valida que el usuario esté autenticado antes de permitir
 * el acceso a la ruta. Extrae el token JWT del header Authorization o de
 * la cookie `sb_access_token`, lo valida con Supabase, y añade la información
 * del usuario al contexto de la petición.
 *
 * @throws {AuthenticationError} Si no se proporciona token o el token es inválido
 *
 * @example
 * ```typescript
 * import { authMiddleware } from './middlewares/auth'
 *
 * // Uso en una ruta protegida
 * app.get('/api/profile', authMiddleware, async (c) => {
 *   const userId = c.get('userId')
 *   const userEmail = c.get('userEmail')
 *   // ... lógica de la ruta
 * })
 * ```
 */
export const authMiddleware: MiddlewareHandler = async (c, next) => {
  try {
    // Try Authorization header first
    const authHeader = c.req.header('Authorization')
    let token = authHeader ? authHeader.replace('Bearer ', '') : undefined

    // Fallback: try sb_access_token cookie
    if (!token) {
      const cookie = c.req.header('cookie') ?? ''
      token = cookie.match(/(?:^|;\s*)sb_access_token=([^;]+)/)?.[1]
    }

    if (!token) {
      throw new AuthenticationError('No token provided')
    }

    // Let Supabase validate the token and return the user
    const { data, error } = await userService.getUserByAccessToken(token)
    if (error || !data?.user) {
      throw new AuthenticationError('Invalid token')
    }

    const user = data.user
    // Add user info to context
    c.set('userId', user.id)
    c.set('userEmail', user.email ?? '')
    c.set('tokenPayload', { userId: user.id, email: user.email ?? '' })

    await next()
  } catch (error) {
    if (error instanceof AuthenticationError) throw error
    throw new AuthenticationError((error as Error).message || 'Invalid token')
  }
}

/**
 * Middleware de autenticación opcional
 *
 * Este middleware intenta autenticar al usuario pero no lanza errores si
 * no se proporciona token o el token es inválido. Es útil para rutas que
 * pueden funcionar tanto para usuarios autenticados como anónimos.
 *
 * @example
 * ```typescript
 * import { optionalAuthMiddleware } from './middlewares/auth'
 *
 * // Uso en una ruta que funciona con o sin autenticación
 * app.get('/api/products', optionalAuthMiddleware, async (c) => {
 *   const userId = c.get('userId') // Puede ser undefined
 *   const isAuthenticated = !!userId
 *
 *   if (isAuthenticated) {
 *     // Lógica para usuarios autenticados
 *   } else {
 *     // Lógica para usuarios anónimos
 *   }
 * })
 * ```
 */
export const optionalAuthMiddleware: MiddlewareHandler = async (c, next) => {
  try {
    // Try Authorization header first
    const authHeader = c.req.header('Authorization')
    let token = authHeader ? authHeader.replace('Bearer ', '') : undefined

    // Fallback: try sb_access_token cookie
    if (!token) {
      const cookie = c.req.header('cookie') ?? ''
      token = cookie.match(/(?:^|;\s*)sb_access_token=([^;]+)/)?.[1]
    }

    if (token) {
      const { data, error } = await userService.getUserByAccessToken(token)
      if (data?.user && !error) {
        c.set('userId', data.user.id)
        c.set('userEmail', data.user.email ?? '')
        c.set('tokenPayload', { userId: data.user.id, email: data.user.email ?? '' })
      }
    }

    await next()
  } catch (error) {
    // For optional auth, we don't throw errors
    await next()
  }
}
