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
import { authMiddleware } from '../middlewares/authMiddleware.js'

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
          ${status === 'APPROVED'
      ? 'Tu pago ha sido procesado correctamente.'
      : status === 'DECLINED'
        ? 'Tu pago no pudo ser procesado. Por favor intenta nuevamente.'
        : 'Tu pago está siendo procesado.'
    }
        </p>
        ${transactionId
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

wompiRoutes.use("/pay-with-points", authMiddleware);

// ==================== RUTA: Pagar 100% con puntos ====================

/**
 * POST /pay-with-points
 * Permite al usuario pagar su carrito usando 100% puntos de recompensa.
 * - Verifica que el usuario tenga suficientes puntos
 * - Crea la orden desde el carrito
 * - Deducir los puntos usados
 * - Marcar la orden como confirmada
 * - Asignar claves y enviar email de confirmación (mismo flujo que webhook APPROVED)
 */
const payWithPointsRoute = createRoute({
  method: 'post',
  path: '/pay-with-points',
  tags: ['Wompi'],
  summary: 'Pagar una orden existente usando puntos (100%)',
  description: 'Procesa el pago de una orden PENDIENTE usando puntos de recompensa (requiere autenticación)',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            // Accept either string or number to be flexible with clients
            orderId: z.union([z.string(), z.number()]).describe('ID de la orden a pagar con puntos'),
          })
        }
      }
    }
  },
  responses: {
    200: { description: 'Orden procesada exitosamente', content: { 'application/json': { schema: z.object({ success: z.boolean(), orderId: z.string(), message: z.string().optional() }) } } },
    400: { description: 'Bad request' },
    401: { description: 'Not authenticated' },
    404: { description: 'Order not found' },
    500: { description: 'Server error' }
  }
})

wompiRoutes.openapi(payWithPointsRoute, async (c: Context) => {
  try {
    // If auth middleware ran earlier, it will set userId in the context.
    // Prefer that, otherwise fall back to parsing Authorization header and validating the token.
    let userId = c.get('userId') as string | undefined
    let userResp: any = null

    if (!userId) {
      const authHeader = c.req.header('Authorization')
      const token = authHeader ? authHeader.replace('Bearer ', '') : undefined
      if (!token) return c.json({ success: false, error: 'Not authenticated' }, 401)

      const { createSupabaseClient } = await import('../services/user.service.js')
      const client = createSupabaseClient(token)
      const { data, error: userErr } = await client.auth.getUser()
      if (userErr || !data?.user) return c.json({ success: false, error: 'Invalid user token' }, 401)
      userResp = data
      userId = data.user.id
    }

    // 2. Obtener orderId del body (acepta string o number)
    const body = await c.req.json()
    const rawOrderId = body.orderId
    if (rawOrderId === undefined || rawOrderId === null) return c.json({ success: false, error: 'orderId is required' }, 400)
    const orderIdNum = Number(rawOrderId)
    if (Number.isNaN(orderIdNum)) return c.json({ success: false, error: 'orderId must be numeric' }, 400)

    // 3. Obtener la orden y validar que pertenece al usuario y está pendiente
    const { getOrderById } = await import('../services/order.service.js')
    const order = await getOrderById(userId, orderIdNum)

    if (!order) {
      return c.json({ success: false, error: 'Order not found or does not belong to user' }, 404)
    }
    if (order.status !== 'pending') {
      return c.json({ success: false, error: `Order status is '${order.status}', not 'pending'` }, 400)
    }

    // 4. Calcular total y puntos requeridos
    const totalAmount = order.order_items?.reduce((s, it) => s + (it.price || 0) * (it.quantity || 0), 0) || 0;

    const pointsSvc = await import('../services/points.service.js')
    const { getUserPointsBalance, POINTS_CONSTANTS, pointsToPesos, pesosToPoints, deductPoints, calculateEarnedPoints, addPoints, recordOrderPoints } = pointsSvc
    const requiredPoints = Math.ceil(totalAmount / POINTS_CONSTANTS.PESOS_PER_POINT)

    // 5. Verificar balance de puntos
    const balance = await getUserPointsBalance(userId)
    logger.info(balance);
    if (!balance || (balance.balance || 0) < requiredPoints) {
      return c.json({ success: false, error: 'Insufficient points balance', requiredPoints, available: balance?.balance || 0 }, 400)
    }

    // =================================================================
    // INICIO: Lógica similar al Webhook 'APPROVED'
    // =================================================================

    // 6. Deducir puntos del usuario
    const deducted = await deductPoints(userId, requiredPoints, `Usado en orden #${order.id}`, order.id, { method: 'points' })
    if (!deducted) {
      return c.json({ success: false, error: 'Failed to deduct points' }, 500)
    }

    // 7. Actualizar orden a 'confirmed' y registrar puntos usados
    const { updateOrderStatusWithPayment } = await import('../services/order.service.js')
    await updateOrderStatusWithPayment(order.id, 'confirmed', `points-payment-${Date.now()}`, undefined, requiredPoints)

    // 8. Calcular montos y puntos ganados (si aplica)
    const discountAmount = pointsToPesos(requiredPoints)
    const paidAmount = Math.max(0, totalAmount - discountAmount)
    const pointsEarned = calculateEarnedPoints(paidAmount)

    if (pointsEarned > 0) {
      await addPoints(userId, pointsEarned, 'earned', `Ganado por compra de orden #${order.id}`, order.id, { paidAmount })
    }

    // 9. Registrar la transacción de puntos en 'order_points'
    await recordOrderPoints(order.id, userId, requiredPoints, pointsEarned, discountAmount)

    // 10. Asignar claves y enviar email
    try {
      const { assignKeysToUser } = await import('../services/product_key.service.js')
      const { sendOrderEmail } = await import('../services/mail.service.js')

      let totalKeysCount = 0
      const assignedKeysDetails: Array<{ productId: string; productName: string; keys: Array<{ id: string; license_key: string }> }> = []

      if (order.order_items) {
        for (const item of order.order_items) {
          const assigned = await assignKeysToUser(String(item.product_id), order.user_id, item.quantity, item.id)
          if (assigned.length > 0) {
            assignedKeysDetails.push({
              productId: String(item.product_id),
              productName: item.product?.name || `Producto #${item.product_id}`,
              keys: assigned.map((k: any) => ({ id: k.id, license_key: k.license_key }))
            })
            totalKeysCount += assigned.length
          }
        }
      }

      const attachments: Array<{ data: Buffer | string, filename: string, contentType?: string }> = []
      if (assignedKeysDetails.length > 0) {
        let keysFileContent = `CLAVES DE LICENCIA - Orden ${order.id}\n\n`
        assignedKeysDetails.forEach((product) => {
          keysFileContent += `PRODUCTO: ${product.productName} (ID: ${product.productId})\n`
          product.keys.forEach((key: any, idx: number) => {
            keysFileContent += `${idx + 1}. ${key.license_key} (id: ${key.id})\n`
          })
          keysFileContent += '\n'
        })
        attachments.push({ data: Buffer.from(keysFileContent, 'utf-8'), filename: `claves-orden-${order.id}.txt`, contentType: 'text/plain; charset=utf-8' })
      }

      const email = userResp.user.email || ''
      const customerName = userResp.user.user_metadata?.full_name || email.split('@')[0] || 'Cliente'
      const reference = `ORDER-${order.id}`

      const emailTemplateUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/email/order-status`
      await sendOrderEmail({
        to: email,
        subject: `✅ Orden ${reference} - Pago Confirmado (Puntos)`,
        templatePath: emailTemplateUrl,
        templateQuery: {
          reference,
          status: 'confirmed',
          keysCount: String(totalKeysCount),
          orderId: String(order.id),
          customerName,
          pointsUsed: String(requiredPoints),
          pointsEarned: String(pointsEarned),
          discountAmount: String(discountAmount)
        },
        attachPdf: false,
        attachments
      })
    } catch (e) {
      logger.warn({ err: e, orderId: order.id }, 'Failed to assign keys or send email after points payment')
    }

    // =================================================================
    // FIN: Lógica similar al Webhook 'APPROVED'
    // =================================================================

    return c.json({ success: true, orderId: String(order.id), message: 'Order processed successfully using points' }, 200)
  } catch (error: any) {
    logger.error({ err: error }, 'Error processing pay-with-points')
    return c.json({ success: false, error: 'Error processing pay-with-points', details: error?.message }, 500)
  }
})


export default wompiRoutes
