import * as promClient from 'prom-client';

/**
 * Configuración de métricas de monitoreo para la aplicación Mercador
 *
 * Este módulo configura todas las métricas de Prometheus utilizadas para monitorear
 * el rendimiento, salud y uso de la aplicación backend. Las métricas incluyen
 * duración de requests HTTP, contadores de requests, usuarios activos, y métricas
 * específicas de Redis.
 *
 * @module config/metrics
 */

/**
 * Registro principal de métricas de Prometheus
 *
 * Este registro contiene todas las métricas personalizadas de la aplicación.
 * Se utiliza para recolectar y exponer métricas a través del endpoint /metrics.
 *
 * @example
 * ```typescript
 * import { register } from './config/metrics'
 *
 * // Obtener todas las métricas en formato Prometheus
 * const metrics = await register.metrics()
 * ```
 */
export const register = new promClient.Registry();

// Recolectar métricas por defecto (CPU, memoria, GC, event loop, etc.)
promClient.collectDefaultMetrics({ register });

/**
 * Histograma para medir la duración de requests HTTP
 *
 * Esta métrica mide el tiempo que toma procesar cada request HTTP,
 * categorizado por método, ruta y código de respuesta.
 *
 * @example
 * ```typescript
 * import { httpRequestDurationMs } from './config/metrics'
 *
 * // Medir duración de un request
 * const endTimer = httpRequestDurationMs.startTimer({
 *   method: 'GET',
 *   route: '/api/products'
 * })
 *
 * // Al finalizar el request
 * endTimer({ code: '200' })
 * ```
 */
export const httpRequestDurationMs = new promClient.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'code'] as const,
  buckets: [50, 100, 200, 300, 500, 1000],
  registers: [register],
});

/**
 * Contador del total de requests HTTP procesados
 *
 * Esta métrica cuenta el número total de requests HTTP recibidos,
 * categorizados por método, ruta y código de respuesta.
 *
 * @example
 * ```typescript
 * import { httpRequestsTotal } from './config/metrics'
 *
 * // Incrementar contador después de procesar un request
 * httpRequestsTotal.inc({
 *   method: 'POST',
 *   route: '/api/auth/login',
 *   code: '200'
 * })
 * ```
 */
export const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'code'] as const,
  registers: [register],
});

/**
 * Gauge para medir el número de usuarios activos
 *
 * Esta métrica mide el número actual de usuarios conectados o activos
 * en la aplicación. Debe actualizarse manualmente en los handlers.
 *
 * @example
 * ```typescript
 * import { activeUsers } from './config/metrics'
 *
 * // Incrementar cuando un usuario se conecta
 * activeUsers.inc()
 *
 * // Decrementar cuando un usuario se desconecta
 * activeUsers.dec()
 * ```
 */
export const activeUsers = new promClient.Gauge({
  name: 'active_users',
  help: 'Current number of active users',
  registers: [register],
});

/**
 * Histograma para medir la latencia de Redis
 *
 * Esta métrica mide el tiempo de respuesta de las operaciones PING
 * a Redis, útil para monitorear la salud de la conexión al cache.
 *
 * @example
 * ```typescript
 * import { redisLatency } from './config/metrics'
 *
 * // Medir latencia de Redis
 * const endTimer = redisLatency.startTimer()
 * await redis.ping()
 * endTimer()
 * ```
 */
export const redisLatency = new promClient.Histogram({
  name: 'redis_ping_latency_ms',
  help: 'Latency of Redis PING in ms',
  buckets: [1, 5, 10, 50, 100, 200, 500],
  registers: [register],
});

/**
 * Contador de reconexiones a Redis
 *
 * Esta métrica cuenta el número total de veces que la aplicación
 * se ha reconectado a Redis, útil para detectar problemas de conectividad.
 *
 * @example
 * ```typescript
 * import { redisReconnections } from './config/metrics'
 *
 * // Incrementar contador en el evento de reconexión
 * redisReconnections.inc()
 * ```
 */
export const redisReconnections = new promClient.Counter({
  name: 'redis_reconnections_total',
  help: 'Total number of Redis reconnections',
  registers: [register],
});

