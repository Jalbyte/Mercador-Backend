/**
 * @fileoverview Punto de entrada principal del servidor backend de Mercador.
 * Configura el servidor Hono con middlewares, rutas y documentación OpenAPI.
 *
 * @author Equipo de Desarrollo Mercador
 * @version 1.0.0
 * @since 2024
 */

import { serve } from '@hono/node-server'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { pino } from 'pino'
import { API_URL, LOG_LEVEL, PORT } from './config/env.js'
import { authMiddleware, optionalAuthMiddleware } from './middlewares/index.js'
import { cookieToAuthHeader } from './middlewares/cookieToAuthHeader.js'
import { healthRoutes, authRoutes, cartRoutes, orderRoutes, productRoutes, profileRoutes, wompiRoutes, adminUserRoutes, adminStatsRoutes} from './routes/index.js'

// Importar métricas centralizadas
import {
  httpRequestDurationMs,
  httpRequestsTotal,
  register
} from './config/metrics.js'
import { RedisService } from './services/redis.service.js'


const redisService = new RedisService()
const app = new OpenAPIHono()

// -------------------- CORS --------------------
/**
 * Middleware global para configurar CORS (Cross-Origin Resource Sharing).
 * Permite solicitudes desde orígenes específicos y maneja preflight requests.
 *
 * @param {Context} c - Contexto de Hono
 * @param {Function} next - Función para continuar con el siguiente middleware
 */
app.use('*', async (c, next) => {
  const origin = c.req.header('Origin') || ''
  const allowedOrigins = ['http://localhost:3000', 'https://www.mercador.app']

  if (origin && allowedOrigins.includes(origin)) {
    c.header('Access-Control-Allow-Origin', origin)
    c.header('Vary', 'Origin')
    c.header('Access-Control-Allow-Credentials', 'true')
  } else {
    c.header('Access-Control-Allow-Origin', '*')
  }

  c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (c.req.method === 'OPTIONS') {
    return c.text('', 204 as any)
  }

  await next()
})

// -------------------- OpenAPI docs --------------------
/**
 * Configura la documentación OpenAPI para la API.
 * Genera especificaciones JSON en /doc y interfaz Swagger en /openapi.
 */
app.doc('/doc', {
  openapi: '3.0.0',
  info: {
    title: 'Mercador API',
    version: '1.0.0',
    description: 'Backend API for Mercador e-commerce platform',
  },
  servers: [{ url: API_URL || `http://localhost:${PORT}` }],
})

/**
 * Ruta para servir la interfaz de documentación Swagger UI.
 * @returns {Response} HTML con la interfaz Swagger
 */
app.get('/openapi', (c) => {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Mercador API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@4/swagger-ui.css"/>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@4/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({ url: '/doc', dom_id: '#swagger-ui', deepLinking: true });
    };
  </script>
</body>
</html>`
  return c.html(html)
})

// -------------------- Logger --------------------
/**
 * Instancia global del logger Pino para registro de eventos.
 * Configurado con el nivel de log definido en variables de entorno.
 */
const logger = pino({ level: LOG_LEVEL })

// -------------------- Middleware de métricas --------------------
/**
 * Middleware para recopilar métricas de rendimiento de las solicitudes HTTP.
 * Registra duración, método, ruta y código de estado usando Prometheus.
 *
 * @param {Context} c - Contexto de Hono
 * @param {Function} next - Función para continuar con el siguiente middleware
 */
app.use('*', async (c, next) => {
  const end = httpRequestDurationMs.startTimer()
  const route = c.req.path
  try {
    await next()
    const status = c.res.status || 200
    end({ method: c.req.method, route, code: String(status) })
    httpRequestsTotal.inc({ method: c.req.method, route, code: String(status) })
  } catch (err) {
    end({ method: c.req.method, route, code: '500' })
    httpRequestsTotal.inc({ method: c.req.method, route, code: '500' })
    logger.error({ err }, 'Request handler error')
    throw err
  }
})

// -------------------- Root --------------------
/**
 * Ruta raíz del servidor. Muestra una página de bienvenida simple.
 * @returns {Response} HTML con mensaje de bienvenida
 */
app.get('/', (c) => {
  return c.html(`<html><body><h1>Mercador</h1><p>CI/CD</p></body></html>`)
})

// -------------------- Middlewares & Rutas --------------------
/**
 * Configuración de middlewares de autenticación para rutas protegidas.
 * - /cart/* requiere autenticación completa
 * - /orders/* requiere autenticación completa
 * - /auth/me requiere autenticación completa
 * - /products/* permite autenticación opcional
 * - /admin/* requiere autenticación completa (verificación de rol admin en el servicio)
 * 
 * IMPORTANTE: cookieToAuthHeader debe ejecutarse ANTES que authMiddleware
 * para convertir cookies en headers Authorization correctamente.
 */
app.use('/cart/*', cookieToAuthHeader)
app.use('/cart/*', authMiddleware)
app.use('/orders/*', cookieToAuthHeader)
app.use('/orders/*', authMiddleware)
app.use('/auth/me', cookieToAuthHeader)
app.use('/auth/me', authMiddleware)
app.use('/products/*', optionalAuthMiddleware)
app.use('/admin/*', cookieToAuthHeader)
app.use('/admin/*', authMiddleware)

/**
 * Montaje de todas las rutas de la aplicación.
 * Cada módulo de rutas se monta en su prefijo correspondiente.
 */
app.route('/health', healthRoutes)
app.route('/auth', authRoutes)
app.route('/profile', profileRoutes)
app.route('/products', productRoutes)
app.route('/cart', cartRoutes)
app.route('/orders', orderRoutes)
// Mercado Pago deshabilitado
// PayU deshabilitado
app.route('/wompi', wompiRoutes)
app.route('/admin/users', adminUserRoutes)
app.route('/admin', adminStatsRoutes)

// -------------------- Redis health --------------------
/**
 * Endpoint para verificar el estado de conexión a Redis.
 * Realiza un ping y mide la latencia de respuesta.
 *
 * @returns {Response} JSON con estado de Redis y latencia en ms
 */
app.get('/redis', async (c) => {
  try {
    const start = Date.now()
    const pong = await redisService.get('ping-test')
    const latency = Date.now() - start
    return c.json({ redis: pong ?? 'ok', latency_ms: latency })
  } catch (err) {
    logger.error({ err }, 'Redis ping failed')
    return c.json({ error: 'Redis not available' }, 503)
  }
})

// -------------------- Metrics --------------------
/**
 * Endpoint para exponer métricas de Prometheus.
 * Incluye métricas de aplicación y del runtime de Node.js.
 *
 * @returns {Response} Métricas en formato Prometheus
 */
app.get('/metrics', async (c) => {
  try {
    const metrics = await register.metrics()
    return c.text(metrics, 200, { 'Content-Type': register.contentType })
  } catch (err) {
    logger.error({ err }, 'Metrics error')
    return c.text('error', 500)
  }
})

// -------------------- Error handler --------------------
/**
 * Manejador global de errores no capturados.
 * Registra el error y retorna una respuesta apropiada según el entorno.
 *
 * @param {Error} err - Error no manejado
 * @param {Context} c - Contexto de Hono
 * @returns {Response} Respuesta de error
 */
app.onError((err, c) => {
  logger.error({ err }, 'Unhandled error')
  if (process.env.NODE_ENV !== 'production') {
    return c.json({ success: false, error: err?.message, stack: err?.stack }, 500)
  }
  return c.json({ success: false, error: 'Internal server error' }, 500)
})

// -------------------- Start server --------------------
/**
 * Inicialización del servidor HTTP.
 * Configura el puerto y registra el evento de inicio.
 */
serve({ fetch: app.fetch, port: PORT }, (info) => {
  logger.info(`Server is running on http://localhost:${info.port}`)
})

// -------------------- Graceful shutdown --------------------

// Graceful shutdown
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await redisService.disconnect()
    logger.info('Redis connection closed')
    process.exit(0)
  })
}
// 🚀 Ruta temporal Google OAuth callback (sin cambios)
const homeCallbackRoute = createRoute({
  method: 'get',
  path: '/home',
  responses: {
    200: {
      description: 'Página temporal para manejar el callback de Google OAuth y probar el flujo.',
      content: { 'text/html': { schema: z.string() } },
    },
  },
})

app.openapi(homeCallbackRoute, async (c) => {
  return c.html(`<html><body><h1>Callback</h1></body></html>`)
})
