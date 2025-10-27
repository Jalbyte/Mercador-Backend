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

// DEBUG: Verificar todas las variables de entorno
import { env } from './env.js'

console.log('=== ENV VARIABLES DEBUG ===')
console.log('NODE_ENV:', env.NODE_ENV)
console.log('PORT:', env.PORT)
console.log('')
console.log('--- Database ---')
console.log('SUPABASE_URL:', env.SUPABASE_URL)
console.log('SUPABASE_ANON_KEY exists:', !!env.SUPABASE_ANON_KEY)
console.log('SUPABASE_ANON_KEY length:', env.SUPABASE_ANON_KEY?.length)
console.log('SUPABASE_SERVICE_ROLE_KEY exists:', !!env.SUPABASE_SERVICE_ROLE_KEY)
console.log('SUPABASE_SERVICE_ROLE_KEY length:', env.SUPABASE_SERVICE_ROLE_KEY?.length)
console.log('SUPABASE_SERVICE_ROLE_KEY starts with eyJ:', env.SUPABASE_SERVICE_ROLE_KEY?.startsWith('eyJ'))
console.log('')
console.log('--- Redis ---')
console.log('REDIS_URL:', env.REDIS_URL || 'not set')
console.log('REDIS_HOST:', env.REDIS_HOST)
console.log('REDIS_PORT:', env.REDIS_PORT)
console.log('REDIS_TOKEN exists:', !!env.REDIS_TOKEN)
console.log('REDIS_PASSWORD exists:', !!env.REDIS_PASSWORD)
console.log('UPSTASH_REDIS_REST_URL:', env.UPSTASH_REDIS_REST_URL || 'not set')
console.log('UPSTASH_REDIS_REST_TOKEN exists:', !!env.UPSTASH_REDIS_REST_TOKEN)
console.log('')
console.log('--- Auth & URLs ---')
console.log('API_URL:', env.API_URL || 'not set')
console.log('APP_REDIRECT_URL:', env.APP_REDIRECT_URL || 'not set')
console.log('POST_LOGOUT_REDIRECT_URL:', env.POST_LOGOUT_REDIRECT_URL || 'not set')
console.log('FRONTEND_URL:', env.FRONTEND_URL || 'not set')
console.log('CSRF_COOKIE:', env.CSRF_COOKIE)
console.log('REFRESH_TOKEN_TTL_DAYS:', env.REFRESH_TOKEN_TTL_DAYS)
console.log('')
console.log('--- Storage ---')
console.log('BUCKET_ACCESS_ID exists:', !!env.BUCKET_ACCESS_ID)
console.log('BUCKET_ACCESS_KEY exists:', !!env.BUCKET_ACCESS_KEY)
console.log('')
console.log('Mode:', env.NODE_ENV !== 'production' ? '🧪 SANDBOX (will use TEST token)' : '🚀 PRODUCTION')
console.log('')
console.log('--- Logging ---')
console.log('LOG_LEVEL:', env.LOG_LEVEL)
console.log('')
console.log('--- Runtime ---')
console.log('Node version:', process.version)
console.log('globalThis.fetch available:', typeof globalThis.fetch !== 'undefined')
console.log('============================')
console.log('')

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
