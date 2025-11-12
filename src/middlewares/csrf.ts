import type { Context, Next } from 'hono'
import { CSRF_COOKIE, NODE_ENV, API_URL } from '../config/env.js'

/**
 * Middleware y utilidades para protección CSRF (Cross-Site Request Forgery)
 *
 * Este módulo proporciona protección contra ataques CSRF mediante:
 * - Middleware que valida tokens CSRF en requests no-GET
 * - Función para emitir cookies CSRF seguras
 * - Validación de tokens desde headers y cookies
 *
 * @module middlewares/csrf
 */

/**
 * Middleware de protección CSRF
 *
 * Crea un middleware que valida tokens CSRF para requests que modifican datos
 * (POST, PUT, DELETE, PATCH). El token debe enviarse tanto en el header
 * `x-csrf-token` como en la cookie correspondiente.
 *
 * @returns Middleware function para Hono
 *
 * @example
 * ```typescript
 * import { csrfMiddleware } from './middlewares/csrf'
 *
 * // Aplicar protección CSRF a rutas que modifican datos
 * app.use('/api/*', csrfMiddleware())
 *
 * // En el frontend, incluir el token CSRF en requests:
 * // headers: { 'x-csrf-token': csrfTokenFromCookie }
 * ```
 */
export function csrfMiddleware() {
    return async (c: Context, next: Next) => {
        if (c.req.method === 'GET' || c.req.method === 'HEAD') return next()
        const header = c.req.header('x-csrf-token')
        const cookie = c.req.header('cookie') ?? ''
        const cookieToken = cookie.match(new RegExp(`${CSRF_COOKIE}=([^;]+)`))?.[1]
        if (!header || !cookieToken || header !== cookieToken) {
            return c.json({ success: false, error: 'CSRF token inválido' }, 403)
        }
        return next()
    }
}

/**
 * Genera y devuelve el header Set-Cookie para el token CSRF
 *
 * Crea un token CSRF único y lo configura como cookie HttpOnly=false
 * para que el frontend pueda leerlo y enviarlo en el header x-csrf-token.
 * La cookie tiene una duración de 1 día y configuraciones de seguridad apropiadas.
 *
 * @returns Header Set-Cookie completo para el token CSRF
 *
 * @example
 * ```typescript
 * import { issueCsrfCookie } from './middlewares/csrf'
 *
 * // Después de login/signup exitoso
 * const csrfCookie = issueCsrfCookie()
 * c.header('Set-Cookie', csrfCookie)
 *
 * // El frontend puede leer la cookie y enviarla en headers:
 * // const csrfToken = document.cookie
 * //   .split('; ')
 * //   .find(row => row.startsWith('csrf_token='))
 * //   ?.split('=')[1]
 * ```
 */
export function issueCsrfCookie(): string {
    const val = crypto.randomUUID()
    const isProduction = NODE_ENV === 'production'

    // Determinar Domain igual que en auth.ts/user.service.ts
    function getCookieDomain(): string | undefined {
        if (NODE_ENV !== 'production') return undefined
        if (API_URL && API_URL.includes('mercador.app')) return '.mercador.app'
        return undefined
    }

    const domain = getCookieDomain()

    const opts = [
        `Path=/`,
        `Max-Age=${60 * 60 * 24}`, // 1 día
        isProduction ? 'Secure' : '',
        'SameSite=Lax',
        isProduction && domain ? `Domain=${domain}` : ''
    ].filter(Boolean).join('; ')

    return `${CSRF_COOKIE}=${val}; ${opts}`
}
