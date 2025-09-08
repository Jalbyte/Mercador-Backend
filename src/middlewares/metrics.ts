import type { MiddlewareHandler } from 'hono'
import * as promClient from 'prom-client'

/**
 * Middleware para recopilación de métricas de rendimiento HTTP
 *
 * Este módulo proporciona un middleware que mide y registra métricas
 * de rendimiento de las requests HTTP usando Prometheus, incluyendo:
 * - Duración de requests
 * - Contadores de requests totales
 * - Métricas por método HTTP, ruta y código de respuesta
 *
 * @module middlewares/metrics
 */

// Create Prometheus metrics
const httpRequestDurationMs = new promClient.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'code'] as const,
  buckets: [50, 100, 200, 300, 500, 1000]
})

const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'code'] as const
})

// Collect default metrics
promClient.collectDefaultMetrics()

/**
 * Middleware que mide métricas de rendimiento de requests HTTP
 *
 * Este middleware mide el tiempo de procesamiento de cada request HTTP
 * y registra métricas en Prometheus. Las métricas incluyen duración,
 * método HTTP, ruta y código de respuesta.
 *
 * @param c - Contexto de Hono
 * @param next - Función para continuar con el siguiente middleware
 * @throws Re-lanza cualquier error que ocurra en middlewares subsiguientes
 *
 * @example
 * ```typescript
 * import { metricsMiddleware } from './middlewares/metrics'
 *
 * // Aplicar middleware de métricas
 * app.use('*', metricsMiddleware)
 *
 * // Las métricas estarán disponibles en /metrics
 * app.get('/metrics', async (c) => {
 *   const metrics = await promClient.register.metrics()
 *   return c.text(metrics)
 * })
 * ```
 */
export const metricsMiddleware: MiddlewareHandler = async (c, next) => {
  const start = Date.now()
  const method = c.req.method
  const path = c.req.path

  try {
    await next()

    const duration = Date.now() - start
    const status = c.res.status || 200

    // Record metrics
    httpRequestDurationMs
      .labels(method, path, String(status))
      .observe(duration)

    httpRequestsTotal
      .labels(method, path, String(status))
      .inc()

  } catch (error) {
    const duration = Date.now() - start

    // Record error metrics
    httpRequestDurationMs
      .labels(method, path, '500')
      .observe(duration)

    httpRequestsTotal
      .labels(method, path, '500')
      .inc()

    throw error
  }
}
