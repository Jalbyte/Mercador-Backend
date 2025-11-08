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
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Redis
  /** URL completa de conexión a Redis (opcional, alternativa a configuración individual) */
  REDIS_URL: z.url().optional(),

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
  // Frontend URL
  /** URL del frontend para redirecciones de pago */
  FRONTEND_URL: z.string().url().optional(),

  // Wompi
  /** Public Key de Wompi - usada en el widget del frontend */
  WOMPI_PUBLIC_KEY: z.string().min(1).optional(),
  /** Private Key de Wompi - usada para crear transaction intents desde el backend */
  WOMPI_PRIVATE_KEY: z.string().min(1).optional(),
  /** URL de la API de Wompi (sandbox o producción) */
  WOMPI_API_URL: z.string().url().default('https://sandbox.wompi.co/v1'),
  /** URL de redirección después del pago exitoso */
  WOMPI_REDIRECT_URL: z.string().url().optional(),
  /** Secret para validar firma de webhooks de Wompi */
  WOMPI_EVENTS_SECRET: z.string().min(1).optional(),
  
  // Email & Reports
  /** API Key de Mailgun para envío de emails */
  MAILGUN_API_KEY: z.string().min(1),
  /** Dominio de Mailgun configurado (ej: auth.mercador.app) */
  MAILGUN_DOMAIN: z.string().min(1).default('auth.mercador.app'),
  /** Habilitar adjunto de PDF en emails de orden (true/false) */
  ENABLE_PDF_ATTACH: z.coerce.boolean().default(false)
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
  LOG_LEVEL,
  APP_REDIRECT_URL,
  POST_LOGOUT_REDIRECT_URL,
  API_URL,
  CSRF_COOKIE,
  FRONTEND_URL,
  WOMPI_PUBLIC_KEY,
  WOMPI_PRIVATE_KEY,
  WOMPI_API_URL,
  WOMPI_REDIRECT_URL,
  WOMPI_EVENTS_SECRET,
  MAILGUN_API_KEY,
  MAILGUN_DOMAIN,
  ENABLE_PDF_ATTACH,
} = env
