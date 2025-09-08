import { serve } from '@hono/node-server'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { pino } from 'pino'
import { API_URL, LOG_LEVEL, PORT } from './config/env.js'
import { authMiddleware, optionalAuthMiddleware } from './middlewares/index.js'
import { authRoutes, cartRoutes, healthRoutes, orderRoutes, productRoutes, profileRoutes } from './routes/index.js'

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
app.doc('/doc', {
  openapi: '3.0.0',
  info: {
    title: 'Mercador API',
    version: '1.0.0',
    description: 'Backend API for Mercador e-commerce platform',
  },
  servers: [{ url: API_URL || `http://localhost:${PORT}` }],
})

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
const logger = pino({ level: LOG_LEVEL })

// -------------------- Middleware de métricas --------------------
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
app.get('/', (c) => {
  return c.html(`<html><body><h1>Mercador</h1><p>Bienvenido</p></body></html>`)
})

// -------------------- Middlewares & Rutas --------------------
app.use('/cart/*', authMiddleware)
app.use('/orders/*', authMiddleware)
app.use('/auth/me', authMiddleware)
app.use('/products/*', optionalAuthMiddleware)

app.route('/health', healthRoutes)
app.route('/auth', authRoutes)
app.route('/profile', profileRoutes)
app.route('/products', productRoutes)
app.route('/cart', cartRoutes)
app.route('/orders', orderRoutes)

// -------------------- Redis health --------------------
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
app.onError((err, c) => {
  logger.error({ err }, 'Unhandled error')
  if (process.env.NODE_ENV !== 'production') {
    return c.json({ success: false, error: err?.message, stack: err?.stack }, 500)
  }
  return c.json({ success: false, error: 'Internal server error' }, 500)
})

// -------------------- Start server --------------------
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
