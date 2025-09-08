import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } from './env.js'

/**
 * Configuración de clientes Supabase para la aplicación Mercador
 *
 * Este módulo configura dos tipos de clientes Supabase:
 * - Cliente público: Para operaciones del lado cliente con permisos limitados
 * - Cliente administrador: Para operaciones del lado servidor con permisos completos
 *
 * @module config/supabase
 */

// DEBUG: Verificar variables de entorno
console.log('=== ENV VARIABLES DEBUG ===')
console.log('SUPABASE_URL:', SUPABASE_URL)
console.log('ANON_KEY exists:', !!SUPABASE_ANON_KEY)
console.log('ANON_KEY length:', SUPABASE_ANON_KEY?.length)
console.log('SERVICE_ROLE_KEY exists:', !!SUPABASE_SERVICE_ROLE_KEY)
console.log('SERVICE_ROLE_KEY length:', SUPABASE_SERVICE_ROLE_KEY?.length)
console.log('SERVICE_ROLE_KEY starts with eyJ:', SUPABASE_SERVICE_ROLE_KEY?.startsWith('eyJ'))
console.log('============================')

// Runtime diagnostics
console.log('Node version:', process.version)
console.log('globalThis.fetch available:', typeof globalThis.fetch !== 'undefined')

/**
 * Cliente Supabase para operaciones del lado cliente
 *
 * Este cliente se utiliza para operaciones que requieren autenticación de usuario
 * pero con permisos limitados según las políticas RLS (Row Level Security) de Supabase.
 * Es adecuado para operaciones desde el frontend o APIs públicas.
 *
 * @example
 * ```typescript
 * import { supabase } from './config/supabase'
 *
 * // Obtener datos del usuario autenticado
 * const { data, error } = await supabase
 *   .from('profiles')
 *   .select('*')
 *   .eq('user_id', userId)
 * ```
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

/**
 * Cliente Supabase administrativo para operaciones del lado servidor
 *
 * Este cliente tiene permisos completos para acceder a todas las tablas y
 * operaciones en Supabase, sin restricciones de RLS. Debe usarse únicamente
 * en el backend para operaciones administrativas o de sistema.
 *
 * @example
 * ```typescript
 * import { supabaseAdmin } from './config/supabase'
 *
 * if (supabaseAdmin) {
 *   // Operaciones administrativas
 *   const { data, error } = await supabaseAdmin
 *     .from('admin_logs')
 *     .insert({ action: 'user_deleted', user_id: userId })
 * }
 * ```
 */
export const supabaseAdmin = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null

// Debug: Imprimir las primeros caracteres de tu clave
console.log('SERVICE_ROLE_KEY first 10 chars:', SUPABASE_SERVICE_ROLE_KEY?.substring(0, 10))
