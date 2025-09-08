import type { MiddlewareHandler } from 'hono';

/**
 * Middleware para convertir cookies de Supabase en headers Authorization
 *
 * Este middleware facilita la autenticación convirtiendo automáticamente
 * la cookie `sb_access_token` de Supabase en un header `Authorization`
 * con formato Bearer. Esto es útil cuando los clientes envían tokens
 * a través de cookies en lugar de headers.
 *
 * @module middlewares/cookieToAuthHeader
 */

/**
 * Middleware que convierte cookies de autenticación en headers Authorization
 *
 * Si no existe un header Authorization pero sí una cookie `sb_access_token`,
 * este middleware crea automáticamente el header Authorization con el token
 * de la cookie. Esto permite que las rutas que esperan headers Authorization
 * funcionen también con cookies.
 *
 * @param c - Contexto de Hono
 * @param next - Función para continuar con el siguiente middleware
 *
 * @example
 * ```typescript
 * import { cookieToAuthHeader } from './middlewares/cookieToAuthHeader'
 *
 * // El middleware se aplica antes de la autenticación
 * app.use('/api/*', cookieToAuthHeader)
 * app.use('/api/*', authMiddleware)
 *
 * // Ahora las rutas funcionan tanto con:
 * // - Authorization: Bearer <token>
 * // - Cookie: sb_access_token=<token>
 * ```
 */
export const cookieToAuthHeader: MiddlewareHandler = async (c, next) => {
  const cookie = c.req.header('cookie') ?? '';
  if (!c.req.header('Authorization')) {
    const match = cookie.match(/(?:^|;\s*)sb_access_token=([^;]+)/);
    if (match) {
      c.req.raw.headers.set('Authorization', `Bearer ${match[1]}`);
    }
  }
  await next();
};