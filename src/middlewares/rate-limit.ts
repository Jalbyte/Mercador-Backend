import type { Context, Next } from 'hono'
import { redisService } from '../services/redis.service.js'

/**
 * Middleware de rate limiting usando Redis
 *
 * Este módulo proporciona funcionalidad de rate limiting para proteger
 * la API contra abuso y ataques DDoS. Utiliza Redis para mantener
 * contadores de requests por IP y ventana de tiempo.
 *
 * @module middlewares/rate-limit
 */

/**
 * Crea un middleware de rate limiting con configuración personalizada
 *
 * Este middleware limita el número de requests que una IP puede hacer
 * en una ventana de tiempo específica. Utiliza Redis para mantener
 * los contadores de manera distribuida.
 *
 * @param config - Configuración del rate limiting
 * @param config.keyPrefix - Prefijo para las claves Redis (ej: 'api', 'auth')
 * @param config.limit - Número máximo de requests permitidos en la ventana
 * @param config.windowSec - Ventana de tiempo en segundos
 * @returns Middleware function para Hono
 *
 * @example
 * ```typescript
 * import { rateLimit } from './middlewares/rate-limit'
 *
 * // Limitar a 100 requests por minuto por IP
 * const apiLimiter = rateLimit({
 *   keyPrefix: 'api',
 *   limit: 100,
 *   windowSec: 60
 * })
 *
 * // Limitar login attempts a 5 por hora
 * const authLimiter = rateLimit({
 *   keyPrefix: 'auth',
 *   limit: 5,
 *   windowSec: 3600
 * })
 *
 * // Aplicar middlewares
 * app.use('/api/*', apiLimiter)
 * app.post('/auth/login', authLimiter)
 * ```
 */
export function rateLimit({ keyPrefix, limit, windowSec }: { keyPrefix: string; limit: number; windowSec: number }) {
  return async (c: Context, next: Next) => {
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      c.req.header('cf-connecting-ip') ||
      c.req.raw.headers.get('x-real-ip') ||
      'unknown'

    const key = `${keyPrefix}:${ip}`
    const current = parseInt((await redisService.get(key)) ?? '0', 10)

    if (current >= limit) {
      return c.json({ success: false, error: 'Too many requests' }, 429)
    }

    await redisService.set(key, String(current + 1), windowSec)
    return next()
  }
}
