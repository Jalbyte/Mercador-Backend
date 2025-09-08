/**
 * Configuración de logging para la aplicación Mercador
 *
 * Este módulo configura y proporciona instancias de logger usando Pino,
 * un logger JSON estructurado de alto rendimiento. Incluye configuración
 * de niveles de log, formateo de timestamps y creación de loggers personalizados.
 *
 * Niveles de logging disponibles:
 * - fatal: Errores críticos que requieren atención inmediata
 * - error: Errores que no detienen la aplicación
 * - warn: Advertencias que requieren atención
 * - info: Información general de funcionamiento
 * - debug: Información detallada para debugging
 * - trace: Información muy detallada (máximo verbosity)
 *
 * @module utils/logger
 *
 * @example
 * ```typescript
 * import { logger, createLogger } from './utils/logger'
 *
 * // Usar logger global
 * logger.info({ userId: '123', action: 'login' }, 'User logged in successfully')
 * logger.error({ error: err.message, userId }, 'Login failed')
 * logger.debug({ data }, 'Processing user data')
 *
 * // Crear logger personalizado
 * const customLogger = createLogger('debug')
 * customLogger.debug('Detailed debugging information')
 *
 * // Logging estructurado
 * logger.info({
 *   userId: '123',
 *   action: 'purchase',
 *   productId: '456',
 *   amount: 99.99,
 *   timestamp: new Date().toISOString()
 * }, 'Product purchased')
 * ```
 */

import { pino } from 'pino'

export const createLogger = (level: string = 'info') => {
  return pino({
    level,
    formatters: {
      level: (label) => {
        return { level: label }
      }
    },
    timestamp: pino.stdTimeFunctions.isoTime
  })
}

export const logger = createLogger(process.env.LOG_LEVEL || 'info')
