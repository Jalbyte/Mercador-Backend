import { Redis as UpstashRedis } from '@upstash/redis'
import pino from 'pino'
import { createClient } from 'redis'
import {
  NODE_ENV,
  REDIS_HOST,
  REDIS_PASSWORD,
  REDIS_PORT,
  REDIS_TOKEN,
  REDIS_URL,
  UPSTASH_REDIS_REST_TOKEN,
  UPSTASH_REDIS_REST_URL,
} from './env.js'

/**
 * Configuración y gestión de conexiones Redis para la aplicación Mercador
 *
 * Este módulo maneja la inicialización y configuración de Redis con soporte
 * para múltiples modos de conexión:
 * - Modo desarrollo: Stub en memoria sin conexión externa
 * - Modo Upstash REST: Para servicios Redis en la nube
 * - Modo TCP: Conexión directa a servidor Redis
 *
 * @module config/redis
 */

let redisClient: any = null
let mode: 'tcp' | 'rest' | null = null

/**
 * Inicializa la conexión a Redis según la configuración disponible
 *
 * Esta función configura Redis de manera inteligente basándose en las variables
 * de entorno disponibles. En desarrollo usa un stub en memoria, mientras que
 * en producción puede usar Upstash REST o conexión TCP directa.
 *
 * @param logger - Instancia del logger para registrar eventos de conexión
 * @returns Cliente Redis configurado y conectado
 * @throws Error si falla la conexión a Redis en modos de producción
 *
 * @example
 * ```typescript
 * import { initRedis } from './config/redis'
 * import { logger } from './utils/logger'
 *
 * const redis = await initRedis(logger)
 * await redis.set('key', 'value')
 * ```
 */
export async function initRedis(logger: pino.Logger) {
  if (redisClient) return redisClient

  // In development, skip external Redis and use a lightweight in-memory stub
  if (NODE_ENV === 'development') {
    logger.info('🧪 NODE_ENV=development — using in-memory Redis stub (no external connection)')
    const store = new Map<string, string>()
    const stub = {
      // tcp-style methods
      set: async (k: string, v: string, opts?: any) => {
        store.set(k, v)
        return 'OK'
      },
      setEx: async (k: string, ttl: number, v: string) => {
        store.set(k, v)
        // En desarrollo no implementamos TTL real, solo guardamos
        return 'OK'
      },
      get: async (k: string) => store.get(k) ?? null,
      del: async (k: string) => (store.delete(k) ? 1 : 0),
      exists: async (k: string) => (store.has(k) ? 1 : 0),
      quit: async () => {},
      // rest client compatibility (Upstash)
      // keep method names compatible: set(key, value) or set(key, value, { ex })
    }
    redisClient = stub
    // mode remains null to indicate no external Redis mode
    return redisClient
  }

  // --- 1. Upstash REST ---
  if (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN) {
    logger.info('🔗 Using Upstash Redis via REST')
    redisClient = new UpstashRedis({
      url: UPSTASH_REDIS_REST_URL,
      token: UPSTASH_REDIS_REST_TOKEN,
    })
    mode = 'rest'
    return redisClient
  }

  // --- 2. TCP con node-redis ---
  const redisUrl = REDIS_URL
  const redisHost = REDIS_HOST || 'redis'
  const redisPort = Number(REDIS_PORT || 6379)
  const redisPassword = REDIS_PASSWORD || REDIS_TOKEN

  let effectiveUrl = redisUrl
  if (redisUrl) {
    try {
      const parsed = new URL(redisUrl)
      if (!parsed.username && !parsed.password && redisPassword) {
        parsed.username = 'default'
        parsed.password = redisPassword
        effectiveUrl = parsed.toString()
      }
    } catch {
      logger.warn('⚠️ Invalid REDIS_URL format, using as-is')
      effectiveUrl = redisUrl
    }
  }

  const client = effectiveUrl
    ? createClient({
        url: effectiveUrl,
        socket: {
          reconnectStrategy: (retries) => Math.min(retries * 50, 2000),
          connectTimeout: 15000,
        },
      })
    : createClient({
        socket: {
          host: redisHost,
          port: redisPort,
          reconnectStrategy: (retries) => Math.min(retries * 50, 2000),
          connectTimeout: 15000,
        },
        password: redisPassword,
      })

  client.on('error', (err) => logger.error({ err }, 'Redis error'))

  try {
    await client.connect()
    logger.info(
      `✅ Connected to Redis at ${redisUrl || `${redisHost}:${redisPort}`} (TCP mode)`
    )
    redisClient = client
    mode = 'tcp'
    return client
  } catch (err: any) {
    logger.error({ err }, '❌ Failed to connect to Redis (TCP)')
    throw err
  }
}

/**
 * Obtiene el modo actual de conexión a Redis
 *
 * Esta función retorna el modo de conexión actualmente configurado,
 * útil para logging y debugging.
 *
 * @returns Modo de conexión actual ('tcp', 'rest', o null para desarrollo)
 *
 * @example
 * ```typescript
 * import { getRedisMode } from './config/redis'
 *
 * const mode = getRedisMode()
 * console.log(`Redis mode: ${mode}`) // 'tcp', 'rest', or null
 * ```
 */
export function getRedisMode() {
  return mode
}
