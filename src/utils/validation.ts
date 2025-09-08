/**
 * Utilidades de validación de datos para la aplicación Mercador
 *
 * Este módulo proporciona funciones de validación comunes para validar
 * emails, UUIDs, números, strings y otros tipos de datos. Incluye
 * sanitización de inputs y validación de campos requeridos.
 *
 * Funciones de validación disponibles:
 * - isValidEmail: Valida formato de email
 * - isValidUUID: Valida formato UUID v4
 * - isPositiveNumber: Valida números positivos
 * - isNonEmptyString: Valida strings no vacíos
 * - sanitizeString: Sanitiza strings removiendo caracteres peligrosos
 * - validateRequired: Valida campos requeridos en objetos
 *
 * @module utils/validation
 *
 * @example
 * ```typescript
 * import {
 *   isValidEmail,
 *   isValidUUID,
 *   validateRequired,
 *   sanitizeString
 * } from './utils/validation'
 *
 * // Validar email
 * if (!isValidEmail(email)) {
 *   throw new ValidationError('Email inválido')
 * }
 *
 * // Validar UUID
 * if (!isValidUUID(productId)) {
 *   throw new ValidationError('ID de producto inválido')
 * }
 *
 * // Validar campos requeridos
 * const userData = { name: 'Juan', email: '' }
 * const missing = validateRequired(userData, ['name', 'email'])
 * if (missing.length > 0) {
 *   throw new ValidationError(`Campos requeridos: ${missing.join(', ')}`)
 * }
 *
 * // Sanitizar input del usuario
 * const cleanInput = sanitizeString(userInput)
 * ```
 */

// Basic validation utilities
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export const isValidUUID = (uuid: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}

export const isPositiveNumber = (value: any): boolean => {
  return typeof value === 'number' && value > 0 && Number.isFinite(value)
}

export const isNonEmptyString = (value: any): boolean => {
  return typeof value === 'string' && value.trim().length > 0
}

// Sanitize string input
export const sanitizeString = (input: string): string => {
  return input.trim().replace(/[<>]/g, '')
}

// Validate required fields in an object
export const validateRequired = (obj: Record<string, any>, requiredFields: string[]): string[] => {
  const missing: string[] = []
  for (const field of requiredFields) {
    if (!(field in obj) || obj[field] === null || obj[field] === undefined || obj[field] === '') {
      missing.push(field)
    }
  }
  return missing
}
