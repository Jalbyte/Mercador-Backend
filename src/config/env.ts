import { z } from 'zod'
import dotenv from 'dotenv'

if (process.env.NODE_ENV !== 'production')
  dotenv.config()

/**
 * Esquema de validación para variables de entorno de la aplicación Mercador
 *
 * Este esquema define todas las variables de entorno requeridas y opcionales
 * utilizadas por la aplicación backend, incluyendo configuración de servidor,
 * base de datos, cache, autenticación y logging.
 *
 * @example
 * ```typescript
 * import { env } from './config/env'
 *
 * console.log(`Server running on port ${env.PORT}`)
 * console.log(`Environment: ${env.NODE_ENV}`)
 * ```
 */
export const envSchema = z.object({
  // Server
  /** Entorno de ejecución de la aplicación */
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  /** Puerto en el que se ejecuta el servidor */
  PORT: z.coerce.number().default(3010),

  // Database
  /** URL de conexión a Supabase */
  SUPABASE_URL: z.url(),
  /** Clave anónima para acceso público a Supabase */
  SUPABASE_ANON_KEY: z.string().min(1),
  /** Clave de servicio para acceso administrativo a Supabase (opcional) */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // Redis
  /** URL completa de conexión a Redis (opcional, alternativa a configuración individual) */
  REDIS_URL: z.url().optional(),
  /** Host del servidor Redis */
  REDIS_HOST: z.string().default('localhost'),
  /** Token de autenticación para Redis (opcional) */
  REDIS_TOKEN: z.string().optional(),
  /** Puerto del servidor Redis */
  REDIS_PORT: z.coerce.number().default(6379),
  /** Contraseña de autenticación para Redis (opcional) */
  REDIS_PASSWORD: z.string().optional(),

  // Auth
  // App URLs

  /** URL REST de Upstash Redis (opcional, para servicios en la nube) */
  UPSTASH_REDIS_REST_URL: z.url().optional(),
  /** Token REST de Upstash Redis (opcional) */
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  /** URL base de la API */
  API_URL: z.url().optional(),
  /** URL de redirección después de autenticación exitosa */
  APP_REDIRECT_URL: z.url().optional(),
  /** URL de redirección después del logout */
  POST_LOGOUT_REDIRECT_URL: z.url().optional(),
  /** ID de acceso para bucket de almacenamiento */
  BUCKET_ACCESS_ID: z.string().min(1).optional(),
  /** Clave de acceso para bucket de almacenamiento */
  BUCKET_ACCESS_KEY: z.string().min(1).optional(),
  /** Nombre de la cookie CSRF */
  CSRF_COOKIE: z.string().default('csrf_token'),
  // Refresh token ttl in days (used for Redis + cookie Max-Age)
  /** Tiempo de vida del refresh token en días (usado para Redis y cookie Max-Age) */
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(7),

  // Logging
  /** Nivel de logging de la aplicación */
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  // Mercado Pago
  /** Token de acceso de Mercado Pago (servidor) - usado para crear preferencias */
  MERCADO_PAGO_ACCESS_TOKEN: z.string().min(1).optional(),
  /** Public key de Mercado Pago (cliente) - usada en frontend si es necesaria */
  MERCADO_PAGO_PUBLIC_KEY: z.string().optional(),
  /** Path público relativo para recibir notificaciones (webhook) */
  MERCADO_PAGO_WEBHOOK_PATH: z.string().default('/payments/webhook'),
  /** URL del frontend para redirecciones de pago */
  FRONTEND_URL: z.string().url().optional(),
})

/**
 * Variables de entorno parseadas y validadas
 *
 * Este objeto contiene todas las variables de entorno validadas según el esquema definido.
 * Si alguna variable requerida no está presente o no cumple con el formato esperado,
 * se lanzará una excepción durante el arranque de la aplicación.
 *
 * @throws {ZodError} Si las variables de entorno no cumplen con el esquema de validación
 */
export const env = envSchema.parse(process.env)

/**
 * Variables de entorno individuales exportadas para conveniencia
 *
 * Estas exportaciones permiten importar variables específicas sin necesidad
 * de acceder al objeto `env` completo.
 *
 * @example
 * ```typescript
 * import { PORT, NODE_ENV, SUPABASE_URL } from './config/env'
 *
 * console.log(`App running on ${PORT} in ${NODE_ENV} mode`)
 * ```
 */
export const {
  NODE_ENV,
  PORT,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  BUCKET_ACCESS_ID,
  BUCKET_ACCESS_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN,
  REDIS_URL,
  REDIS_HOST,
  REDIS_TOKEN,
  REDIS_PORT,
  REDIS_PASSWORD,
  LOG_LEVEL,
  APP_REDIRECT_URL,
  POST_LOGOUT_REDIRECT_URL,
  API_URL,
  CSRF_COOKIE
  ,
  MERCADO_PAGO_ACCESS_TOKEN,
  MERCADO_PAGO_PUBLIC_KEY,
  MERCADO_PAGO_WEBHOOK_PATH,
  FRONTEND_URL
} = env
