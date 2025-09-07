import { createClient } from 'redis'
import { Redis as UpstashRedis } from '@upstash/redis'
import { pino } from 'pino'
import {
  REDIS_HOST,
  REDIS_PASSWORD,
  REDIS_PORT,
  REDIS_TOKEN,
  REDIS_URL,
  UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN,
} from './env.js'

let redisClient: any = null
let mode: 'tcp' | 'rest' | null = null

/**
 * Inicializa Redis en modo Upstash REST o TCP.
 */
export async function initRedis(logger: pino.Logger) {
  if (redisClient) return redisClient

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

export function getRedisMode() {
  return mode
}
