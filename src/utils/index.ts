/**
 * Índice de utilidades de la aplicación Mercador
 *
 * Este módulo centraliza todas las exportaciones de utilidades para facilitar
 * su importación desde otros módulos de la aplicación. Incluye utilidades para:
 * - Logging estructurado con Pino
 * - Validación de datos con Zod
 * - Manejo de errores personalizado
 *
 * @module utils
 *
 * @example
 * ```typescript
 * import { logger, formatError, ValidationError } from './utils'
 *
 * // Usar logger para debugging
 * logger.info({ userId, action: 'login' }, 'User logged in')
 *
 * // Manejar errores de manera consistente
 * try {
 *   // código que puede fallar
 * } catch (error) {
 *   logger.error({ error }, 'Operation failed')
 *   throw new ValidationError('Invalid input data')
 * }
 *
 * // Utilidades disponibles:
 * // - logger: Logging estructurado con Pino
 * // - formatError: Formateo de errores para respuestas HTTP
 * // - ValidationError, AuthenticationError, etc.: Clases de error
 * // - validateData: Funciones de validación con Zod
 * ```
 */

export * from './logger.js'
export * from './validation.js'
export * from './errors.js'
