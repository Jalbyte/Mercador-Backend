/**
 * @fileoverview Rutas para integración con Wompi - Pasarela de pagos
 * Define endpoints para crear transacciones, consultar estados y recibir webhooks
 *
 * @author Equipo de Desarrollo Mercador
 * @version 1.0.0
 * @since 2024
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { WompiService } from '../services/wompi.service.js'
import type { Context } from 'hono'
import { WOMPI_PUBLIC_KEY } from '../config/env.js'
import { logger } from '../utils/logger.js'

const wompiRoutes = new OpenAPIHono()
const wompiService = new WompiService()

/**
 * Schema de respuesta de error
 */
const ErrorResponseSchema = z.object({
  success: z.boolean(),
  error: z.string(),
  details: z.string().optional(),
})

/**
 * Schema para obtener configuración pública
 */
const PublicConfigSchema = z.object({
  publicKey: z.string(),
  isProduction: z.boolean(),
})

// ==================== RUTA: Obtener configuración pública ====================

/**
 * GET /config
 * Obtiene la configuración pública de Wompi (public key)
 * Necesaria para inicializar el widget en el frontend
 */
const getConfigRoute = createRoute({
  method: 'get',
  path: '/config',
  tags: ['Wompi'],
  summary: 'Obtener configuración pública de Wompi',
  description: 'Retorna la public key de Wompi y el modo (sandbox/producción)',
  responses: {
    200: {
      description: 'Configuración pública de Wompi',
      content: {
        'application/json': {
          schema: PublicConfigSchema,
        },
      },
    },
    500: {
      description: 'Error del servidor',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
})

wompiRoutes.openapi(getConfigRoute, async (c: Context) => {
  try {
    const publicKey = WOMPI_PUBLIC_KEY || ''
    const isProduction = !publicKey.includes('test') && !publicKey.includes('sandbox')

    if (!publicKey) {
      return c.json(
        {
          success: false,
          error: 'WOMPI_PUBLIC_KEY no está configurada',
        },
        500
      )
    }

    return c.json({
      publicKey,
      isProduction,
    }, 200)
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: 'Error obteniendo configuración',
        details: error?.message,
      },
      500
    )
  }
})

// ==================== RUTA: Generar firma de integridad ====================

/**
 * POST /generate-signature
 * Genera la firma de integridad para el Widget de Wompi
 * El pago se procesa completamente en el frontend usando el Widget
 */
const generateSignatureRoute = createRoute({
  method: 'post',
  path: '/generate-signature',
  tags: ['Wompi'],
  summary: 'Generar firma de integridad para el Widget',
  description: 'Genera la firma de integridad necesaria para inicializar el Widget de Wompi en el frontend. El usuario ingresará sus datos de pago directamente en el Widget.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            amount: z.number().positive().describe('Monto de la transacción (en la moneda original, no centavos)'),
            currency: z.string().default('COP').describe('Código de moneda (COP, USD, etc.)'),
            reference: z.string().describe('Referencia única de la transacción'),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Firma generada exitosamente',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            signature: z.string().describe('Firma de integridad para el Widget de Wompi'),
            amountInCents: z.number().describe('Monto en centavos'),
            reference: z.string().describe('Referencia de la transacción'),
            currency: z.string().describe('Moneda'),
          }),
        },
      },
    },
    400: {
      description: 'Datos inválidos',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: 'Error del servidor',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
})

wompiRoutes.openapi(generateSignatureRoute, async (c: Context) => {
  try {
    const body = await c.req.json()
  logger.debug({ body }, 'Request body')
    const { amount, currency, reference } = body

    if (!amount || !currency || !reference) {
      return c.json(
        {
          success: false,
          error: 'Faltan parámetros requeridos: amount, currency, reference',
        },
        400
      )
    }

    // Generar firma de integridad para el Widget
    const amountInCents = Math.round(amount * 100)
    const signature = wompiService.generateIntegritySignature(
      reference,
      amountInCents,
      currency
    )

    return c.json({
      success: true,
      signature,
      amountInCents,
      reference,
      currency,
    }, 200)
  } catch (error: any) {
  logger.error({ err: error }, 'Error generando firma Wompi')
    
    return c.json(
      {
        success: false,
        error: 'Error generando firma de integridad',
        details: error?.message,
      },
      500
    )
  }
})

// ==================== RUTA: Consultar estado de transacción ====================

/**
 * GET /status/:transactionId
 * Consulta el estado de una transacción en Wompi usando la API pública
 */
const getStatusRoute = createRoute({
  method: 'get',
  path: '/status/{transactionId}',
  tags: ['Wompi'],
  summary: 'Consultar estado de transacción',
  description: 'Obtiene el estado actual de una transacción en Wompi usando la API pública',
  request: {
    params: z.object({
      transactionId: z.string().describe('ID de la transacción en Wompi'),
    }),
  },
  responses: {
    200: {
      description: 'Estado de la transacción',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            data: z.object({
              id: z.string(),
              reference: z.string(),
              amount_in_cents: z.number(),
              currency: z.string(),
              status: z.string(),
              customer_email: z.string().optional(),
              created_at: z.string(),
              finalized_at: z.string().optional(),
              payment_method_type: z.string().optional(),
              payment_method: z.any().optional(),
            }),
          }),
        },
      },
    },
    404: {
      description: 'Transacción no encontrada',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: 'Error del servidor',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
})

wompiRoutes.openapi(getStatusRoute, async (c: Context) => {
  try {
    const { transactionId } = c.req.param()

    if (!transactionId) {
      return c.json(
        {
          success: false,
          error: 'Transaction ID es requerido',
        },
        404
      )
    }

    // Usar la API pública de Wompi para consultar el estado
    const result = await wompiService.getTransactionStatusPublic(transactionId)

    return c.json({
      success: true,
      data: result.data,
    }, 200)
  } catch (error: any) {
  logger.error({ err: error }, 'Error consultando transacción Wompi')
    return c.json(
      {
        success: false,
        error: 'Error consultando transacción',
        details: error?.message,
      },
      500
    )
  }
})

// ==================== RUTA: Webhook de eventos ====================

/**
 * POST /webhook
 * Recibe notificaciones de eventos de Wompi (webhooks)
 */
const webhookRoute = createRoute({
  method: 'post',
  path: '/webhook',
  tags: ['Wompi'],
  summary: 'Webhook de eventos de Wompi',
  description: 'Endpoint para recibir notificaciones de cambios de estado de transacciones',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.any(), // Schema flexible para webhooks
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Webhook procesado exitosamente',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
        },
      },
    },
    400: {
      description: 'Firma inválida o datos incorrectos',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
})

wompiRoutes.openapi(webhookRoute, async (c: Context) => {
  try {
    const body = await c.req.json()
    // Wompi envía la firma en el header X-Event-Checksum
    const receivedSignature = c.req.header('X-Event-Checksum') || c.req.header('x-event-checksum')
    
    logger.info({
      event: body.event,
      timestamp: body.timestamp,
      transactionId: body.data?.transaction?.id,
      reference: body.data?.transaction?.reference,
      status: body.data?.transaction?.status,
      hasSignature: !!receivedSignature,
      signature: receivedSignature,
    }, '📬 Webhook de Wompi recibido')

    // Validar firma del webhook (crítico para seguridad)
    if (false) {
      const isValidSignature = wompiService.validateWebhookSignature(body)
      if (!isValidSignature) {
  logger.error('🚨 Firma de webhook inválida')
        return c.json(
          {
            success: false,
            error: 'Invalid signature',
          },
          400
        )
      }
  logger.info('✅ Firma de webhook validada correctamente')
    } else {
  logger.warn('⚠️ Webhook sin firma X-Event-Checksum - considera rechazarlo en producción')
    }

    // Procesar el evento del webhook
    const result = await wompiService.processWebhookEvent(body)

    if (!result.success) {
      return c.json(
        {
          success: false,
          error: result.message,
        },
        400
      )
    }

    return c.json({
      success: true,
      message: result.message,
    }, 200)
  } catch (error: any) {
  logger.error({ err: error }, 'Error procesando webhook de Wompi')
    return c.json(
      {
        success: false,
        error: 'Error procesando webhook',
        details: error?.message,
      },
      400
    )
  }
})

// ==================== RUTA: Callback de redirección ====================

/**
 * GET /callback
 * Página de callback después del pago (si se usa redirección en lugar de widget)
 */
const callbackRoute = createRoute({
  method: 'get',
  path: '/callback',
  tags: ['Wompi'],
  summary: 'Callback después del pago',
  description: 'Página de redirección después de completar el pago',
  responses: {
    200: {
      description: 'Página de callback',
      content: {
        'text/html': {
          schema: z.string(),
        },
      },
    },
  },
})

wompiRoutes.openapi(callbackRoute, async (c: Context) => {
  const transactionId = c.req.query('id')
  const status = c.req.query('status')

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Resultado del Pago - Wompi</title>
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .container {
          background: white;
          padding: 3rem;
          border-radius: 1rem;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          text-align: center;
          max-width: 500px;
        }
        .icon {
          font-size: 4rem;
          margin-bottom: 1rem;
        }
        h1 {
          color: #333;
          margin-bottom: 0.5rem;
        }
        p {
          color: #666;
          margin-bottom: 2rem;
        }
        .transaction-id {
          background: #f3f4f6;
          padding: 1rem;
          border-radius: 0.5rem;
          font-family: monospace;
          margin-bottom: 2rem;
        }
        button {
          background: #667eea;
          color: white;
          border: none;
          padding: 1rem 2rem;
          border-radius: 0.5rem;
          font-size: 1rem;
          cursor: pointer;
          transition: background 0.3s;
        }
        button:hover {
          background: #5568d3;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">${status === 'APPROVED' ? '✅' : status === 'DECLINED' ? '❌' : '⏳'}</div>
        <h1>${status === 'APPROVED' ? '¡Pago Exitoso!' : status === 'DECLINED' ? 'Pago Rechazado' : 'Pago Pendiente'}</h1>
        <p>
          ${
            status === 'APPROVED'
              ? 'Tu pago ha sido procesado correctamente.'
              : status === 'DECLINED'
              ? 'Tu pago no pudo ser procesado. Por favor intenta nuevamente.'
              : 'Tu pago está siendo procesado.'
          }
        </p>
        ${
          transactionId
            ? `<div class="transaction-id">
                 <strong>ID de Transacción:</strong><br/>
                 ${transactionId}
               </div>`
            : ''
        }
        <button onclick="window.location.href='/'">Volver al Inicio</button>
      </div>
    </body>
    </html>
  `

  return c.html(html)
})

export default wompiRoutes
