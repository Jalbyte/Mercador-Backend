/**
 * Índice de middlewares de la aplicación Mercador
 *
 * Este módulo centraliza todas las exportaciones de middlewares para facilitar
 * su importación desde otros módulos de la aplicación. Incluye middlewares para:
 * - Logging de requests
 * - Métricas y monitoreo
 * - Autenticación y autorización
 * - Manejo de errores
 *
 * @module middlewares
 *
 * @example
 * ```typescript
 * import {
 *   requestLogger,
 *   authMiddleware,
 *   errorHandler
 * } from './middlewares'
 *
 * // Usar middlewares en la aplicación
 * app.use('*', requestLogger)
 * app.use('/api/*', authMiddleware)
 * app.use('*', errorHandler)
 * ```
 */

export { requestLogger } from './requestLogger.js'
export { metricsMiddleware } from './metrics.js'
export { authMiddleware, optionalAuthMiddleware } from './authMiddleware.js'
export { errorHandler, devErrorHandler } from './errorHandler.js'
