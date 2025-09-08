/**
 * Rutas de health check y monitoreo de salud del sistema
 *
 * Este módulo proporciona endpoints simples para verificar el estado
 * de salud de la aplicación y sus dependencias. Útil para load balancers,
 * orchestrators (como Kubernetes) y herramientas de monitoreo.
 *
 * Funcionalidades implementadas:
 * - ✅ Health check básico con timestamp
 * - ✅ Endpoint de ping/pong para conectividad
 * - ✅ Respuestas rápidas sin dependencias externas
 *
 * @module routes/health
 *
 * @example
 * ```typescript
 * import healthRoutes from './routes/health'
 *
 * // Registrar rutas de health check
 * app.route('/health', healthRoutes)
 *
 * // Endpoints disponibles:
 * // GET /health - Health check completo
 * // GET /health/ping - Ping simple
 *
 * // Uso típico:
 * // - Load balancers: GET /health
 * // - Monitoring: GET /health
 * // - Health checks: GET /health/ping
 * ```
 */

import { OpenAPIHono } from '@hono/zod-openapi'

const healthRoutes = new OpenAPIHono()

/**
 * Health check endpoint principal
 *
 * Retorna el estado de salud de la aplicación con un timestamp.
 * Este endpoint se utiliza para verificar que la aplicación está
 * funcionando correctamente.
 *
 * @returns JSON con status 'ok' y timestamp actual
 *
 * @example
 * ```json
 * GET /health
 * Response: { "status": "ok", "timestamp": "2024-01-15T10:30:00.000Z" }
 * ```
 */
healthRoutes.get('/', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

/**
 * Endpoint de ping simple
 *
 * Retorna 'pong' como respuesta de texto plano. Útil para verificar
 * conectividad básica sin procesamiento JSON.
 *
 * @returns Texto plano 'pong'
 *
 * @example
 * ```text
 * GET /health/ping
 * Response: pong
 * ```
 */
healthRoutes.get('/ping', (c) => {
  return c.text('pong')
})

export default healthRoutes
