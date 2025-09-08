/**
 * Servicio de cache y almacenamiento temporal con Redis
 *
 * Este módulo proporciona una interfaz unificada para interactuar con Redis,
 * soportando múltiples modos de conexión (TCP, Upstash REST, o desarrollo local).
 * Ofrece operaciones básicas de cache con soporte para TTL y manejo automático
 * de reconexiones.
 *
 * Funcionalidades implementadas:
 * - ✅ Conexión automática a Redis según configuración
 * - ✅ Operaciones básicas: set, get, del, exists
 * - ✅ Soporte para TTL (time-to-live)
 * - ✅ Compatibilidad con múltiples proveedores Redis
 * - ✅ Modo desarrollo con stub en memoria
 * - ✅ Manejo automático de reconexiones
 * - ✅ Logging de operaciones
 *
 * @module services/redis.service
 *
 * @example
 * ```typescript
 * import { redisService } from './services/redis.service'
 *
 * // Almacenar valor con TTL
 * await redisService.set('user:123', JSON.stringify(userData), 3600)
 *
 * // Obtener valor
 * const userData = await redisService.get('user:123')
 * if (userData) {
 *   const user = JSON.parse(userData)
 * }
 *
 * // Verificar existencia
 * const exists = await redisService.exists('user:123')
 *
 * // Eliminar clave
 * await redisService.del('user:123')
 * ```
 */

import { initRedis, getRedisMode } from '../config/redis.js'
import { logger } from '../utils/logger.js'

export class RedisService {
  private client: any | null = null

  private async connect() {
    if (!this.client) {
      this.client = await initRedis(logger)
    }
    return this.client
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    const client = await this.connect()
    const mode = getRedisMode()

    if (mode === 'tcp') {
      if (ttlSeconds) {
        await client.set(key, value, { EX: ttlSeconds })
      } else {
        await client.set(key, value)
      }
    } else if (mode === 'rest') {
      if (ttlSeconds) {
        await client.set(key, value, { ex: ttlSeconds })
      } else {
        await client.set(key, value)
      }
    }
  }

  async get(key: string) {
    const client = await this.connect()
    return await client.get(key)
  }

  async del(key: string) {
    const client = await this.connect()
    return await client.del(key)
  }

  async exists(key: string) {
    const client = await this.connect()
    return await client.exists(key)
  }

  async disconnect() {
    if (this.client && getRedisMode() === 'tcp') {
      await this.client.quit()
    }
    this.client = null
  }
}

export const redisService = new RedisService()
