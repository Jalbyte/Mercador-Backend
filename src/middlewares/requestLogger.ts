import type { MiddlewareHandler } from 'hono'
import pino from 'pino'

/**
 * Middleware para logging de requests HTTP
 *
 * Este módulo proporciona un middleware que registra información detallada
 * sobre cada request HTTP, incluyendo método, ruta, tiempo de procesamiento
 * y código de respuesta. Utiliza Pino para logging estructurado.
 *
 * @module middlewares/requestLogger
 */

/**
 * Crea un middleware que registra información de requests HTTP
 *
 * Este middleware mide el tiempo de procesamiento de cada request y
 * registra eventos estructurados con información relevante para debugging
 * y monitoreo de la aplicación.
 *
 * @param logger - Instancia de logger Pino configurada
 * @returns Middleware function para Hono
 *
 * @example
 * ```typescript
 * import { requestLogger } from './middlewares/requestLogger'
 * import { logger } from './utils/logger'
 *
 * // Aplicar middleware de logging a todas las rutas
 * app.use('*', requestLogger(logger))
 *
 * // Los logs incluirán:
 * // - Inicio del request: { method: 'GET', path: '/api/users' }
 * // - Fin del request: { method: 'GET', path: '/api/users', status: 200, duration: 45 }
 * ```
 */
export const requestLogger = (logger: pino.Logger): MiddlewareHandler => {
  return async (c, next) => {
    const start = Date.now()
    const method = c.req.method
    const path = c.req.path

    logger.info({ method, path }, 'Request started')

    await next()

    const duration = Date.now() - start
    const status = c.res.status

    logger.info({ method, path, status, duration }, 'Request completed')
  }
}
