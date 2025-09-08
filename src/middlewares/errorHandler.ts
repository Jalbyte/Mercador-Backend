import type { MiddlewareHandler } from 'hono'
import { formatError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'

/**
 * Middlewares para manejo centralizado de errores
 *
 * Este módulo proporciona middlewares que capturan errores no manejados
 * en las rutas y los procesan de manera consistente, incluyendo logging
 * y formateo de respuestas de error.
 *
 * @module middlewares/errorHandler
 */

/**
 * Middleware de manejo de errores para producción
 *
 * Captura cualquier error no manejado en las rutas subsiguientes y:
 * - Formatea el error usando la utilidad formatError
 * - Registra el error con información del contexto (método, path, IP, etc.)
 * - Devuelve una respuesta JSON estandarizada con el código de estado apropiado
 *
 * @param c - Contexto de Hono
 * @param next - Función para continuar con el siguiente middleware
 * @returns Respuesta JSON con el error formateado
 *
 * @example
 * ```typescript
 * import { errorHandler } from './middlewares/errorHandler'
 *
 * // Aplicar al final de la cadena de middlewares
 * app.use('*', errorHandler)
 *
 * // Los errores en rutas serán capturados automáticamente
 * app.get('/api/test', async (c) => {
 *   throw new Error('Something went wrong')
 *   // Se devuelve: { success: false, error: 'Internal server error' }
 * })
 * ```
 */
export const errorHandler: MiddlewareHandler = async (c, next) => {
  try {
    await next()
  } catch (error) {
    const errorResponse = formatError(error as Error)

    // Log the error
    logger.error({
      error: errorResponse,
      method: c.req.method,
      path: c.req.path,
      userAgent: c.req.header('User-Agent'),
      ip: c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
    }, 'Request error')

    // Return error response
    const statusCode = (error as any).statusCode || 500
    return c.json(errorResponse, statusCode)
  }
}

/**
 * Middleware de manejo de errores para desarrollo
 *
 * Similar al errorHandler pero incluye información adicional para debugging
 * en entorno de desarrollo, como stack traces completos.
 *
 * @param c - Contexto de Hono
 * @param next - Función para continuar con el siguiente middleware
 * @returns Respuesta JSON con el error formateado (incluyendo stack trace en desarrollo)
 *
 * @example
 * ```typescript
 * import { devErrorHandler } from './middlewares/errorHandler'
 *
 * // Solo en desarrollo
 * if (process.env.NODE_ENV === 'development') {
 *   app.use('*', devErrorHandler)
 * }
 *
 * // En desarrollo, los errores incluyen stack traces:
 * // {
 * //   success: false,
 * //   error: 'Something went wrong',
 * //   details: 'Error: Something went wrong\n    at ...'
 * // }
 * ```
 */
export const devErrorHandler: MiddlewareHandler = async (c, next) => {
  try {
    await next()
  } catch (error) {
    const errorResponse = formatError(error as Error)

    // In development, include stack trace
    if (process.env.NODE_ENV === 'development') {
      errorResponse.details = (error as Error).stack
    }

    logger.error({
      error: errorResponse,
      method: c.req.method,
      path: c.req.path
    }, 'Request error')

    const statusCode = (error as any).statusCode || 500
    return c.json(errorResponse, statusCode)
  }
}
