/**
 * @fileoverview Servicio para integración con Wompi - Pasarela de pagos
 * Maneja la creación de transaction intents, consultas de estado y validación de webhooks
 *
 * @author Equipo de Desarrollo Mercador
 * @version 1.0.0
 * @since 2024
 */

import { WOMPI_API_URL, WOMPI_PRIVATE_KEY, WOMPI_EVENTS_SECRET, WOMPI_REDIRECT_URL, API_URL, FRONTEND_URL, ENABLE_PDF_ATTACH } from '../config/env.js'
import crypto from 'crypto'
import { logger } from '../utils/logger.js'

/**
 * Interface para los datos del cliente en una transacción
 */
export interface WompiCustomer {
  email: string
  fullName?: string
  phoneNumber?: string
  legalId?: string
  legalIdType?: string
}

/**
 * Interface para datos de envío/dirección
 */
export interface WompiShippingAddress {
  addressLine1: string
  city: string
  region?: string
  country: string
  phoneNumber?: string
}

/**
 * Interface para crear una transacción en Wompi
 */
export interface WompiTransactionRequest {
  amount: number // en la moneda original (no centavos)
  currency: string
  reference: string
  customer: WompiCustomer
  shippingAddress?: WompiShippingAddress
  redirectUrl?: string
}

/**
 * Interface para la respuesta de Wompi al crear transacción
 */
export interface WompiTransactionResponse {
  data: {
    id: string
    created_at: string
    amount_in_cents: number
    reference: string
    currency: string
    payment_method_type: string
    redirect_url?: string
    payment_link_url?: string
    status: string
    status_message?: string
    customer_email: string
  }
}

/**
 * Interface para el evento de webhook de Wompi
 */
export interface WompiWebhookEvent {
  event: string
  data: {
    transaction: {
      id: string
      amount_in_cents: number
      reference: string
      customer_email: string
      currency: string
      payment_method_type: string
      redirect_url: string
      status: string
      status_message?: string
      created_at: string
      finalized_at?: string
      shipping_address?: any
      payment_method?: any
      payment_link_id?: string
      customer_data?: any
    }
  }
  sent_at: string
  timestamp: number
  signature?: {
    checksum: string
    properties: string[]
  }
}

/**
 * Servicio para manejar operaciones con la API de Wompi
 */
export class WompiService {
  private apiUrl: string
  private privateKey: string
  private eventsSecret: string // Este es el "Integrity Secret" de Wompi
  private redirectUrl: string

  constructor() {
    this.apiUrl = WOMPI_API_URL || 'https://sandbox.wompi.co/v1'
    this.privateKey = WOMPI_PRIVATE_KEY || ''
    this.eventsSecret = WOMPI_EVENTS_SECRET || ''
    this.redirectUrl = WOMPI_REDIRECT_URL || `${API_URL}/wompi/callback`

    if (!this.privateKey) {
      logger.warn('⚠️ WOMPI_PRIVATE_KEY no está configurada')
    }

    if (!this.eventsSecret) {
      logger.warn('⚠️ WOMPI_EVENTS_SECRET (Integrity Secret) no está configurada - requerida para generar firma de integridad del widget')
    }
  }

  /**
   * Genera la firma de integridad para el Widget de Wompi (Checkout Embed)
   * 
   * Según documentación de Wompi para Widget/Checkout:
   * SHA256("<Referencia><Monto><Moneda><SecretoIntegridad>")
   * 
   * ⚠️ IMPORTANTE: Esta es la fórmula para el Widget embebido.
   * Si necesitas crear transacciones vía API /v1/transactions, usa generateApiSignature()
   * 
   * @param reference Referencia única de la transacción
   * @param amountInCents Monto en centavos
   * @param currency Moneda (ej: COP)
   * @returns Firma de integridad en formato hexadecimal
   */
  generateIntegritySignature(reference: string, amountInCents: number, currency: string): string {
    if (!this.eventsSecret) {
      throw new Error('WOMPI_EVENTS_SECRET (Integrity Secret) no está configurada')
    }

    // Fórmula para Widget Embed: reference + amount + currency + secret
    const concatenated = `${reference}${amountInCents}${currency}${this.eventsSecret}`

    // Generar hash SHA256
    const signature = crypto
      .createHash('sha256')
      .update(concatenated)
      .digest('hex')

    logger.info({ reference, amountInCents, currency, type: 'WIDGET_EMBED', signature }, '🔐 Firma de integridad (Widget) generada')

    return signature
  }

  /**
   * Genera la firma de integridad para transacciones vía API /v1/transactions
   * 
   * Según documentación de Wompi para API:
   * SHA256("<Monto><Moneda><Referencia><SecretoIntegridad>")
   * 
   * ⚠️ NOTA: Este método NO se usa en la implementación actual (Widget Embed).
   * Solo se incluye para referencia futura si se necesita integración server-to-server.
   * 
   * @param reference Referencia única de la transacción
   * @param amountInCents Monto en centavos
   * @param currency Moneda (ej: COP)
   * @returns Firma de integridad en formato hexadecimal
   */
  generateApiSignature(reference: string, amountInCents: number, currency: string): string {
    if (!this.eventsSecret) {
      throw new Error('WOMPI_EVENTS_SECRET (Integrity Secret) no está configurada')
    }

    // Fórmula para API: amount + currency + reference + secret (orden diferente)
    const concatenated = `${amountInCents}${currency}${reference}${this.eventsSecret}`

    // Generar hash SHA256
    const signature = crypto
      .createHash('sha256')
      .update(concatenated)
      .digest('hex')

    logger.info({ reference, amountInCents, currency, type: 'API_TRANSACTIONS', signature }, '🔐 Firma de integridad (API) generada')

    return signature
  }

  /**
   * Consulta el estado de una transacción en Wompi usando la API pública
   * (No requiere autenticación con Private Key)
   * 
   * @param transactionId ID de la transacción en Wompi
   * @returns Datos de la transacción
   * @throws Error si la consulta falla
   */
  async getTransactionStatusPublic(transactionId: string): Promise<WompiTransactionResponse> {
    try {
      // La API pública de Wompi no requiere autenticación
      const response = await fetch(`${this.apiUrl}/transactions/${transactionId}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Error fetching transaction: ${response.status}`)
      }

      const result: WompiTransactionResponse = await response.json()
      return result
    } catch (error) {
      logger.error({ error }, 'Error fetching Wompi transaction status (public)')
      throw error
    }
  }

  /**
   * Consulta el estado de una transacción en Wompi usando autenticación privada
   * (Requiere Private Key - usar solo en backend)
   * 
   * @param transactionId ID de la transacción en Wompi
   * @returns Datos de la transacción
   * @throws Error si la consulta falla
   */
  async getTransactionStatus(transactionId: string): Promise<WompiTransactionResponse> {
    try {
      const response = await fetch(`${this.apiUrl}/transactions/${transactionId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.privateKey}`,
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Error fetching transaction: ${response.status}`)
      }

      const result: WompiTransactionResponse = await response.json()
      return result
    } catch (error) {
      logger.error({ error }, 'Error fetching Wompi transaction status (private)')
      throw error
    }
  }

  /**
   * Valida la firma de un webhook de Wompi para verificar su autenticidad
   * 
   * @param event El evento del webhook recibido
   * @returns true si la firma es válida, false en caso contrario
   */
  validateWebhookSignature(event: WompiWebhookEvent): boolean {
    if (!this.eventsSecret) {
      logger.warn('⚠️ WOMPI_EVENTS_SECRET no está configurado, no se puede validar firma')
      return false
    }

    if (!event.signature || !event.signature.checksum || !event.signature.properties) {
      logger.warn('⚠️ El evento no contiene firma')
      return false
    }

    try {
      // Construir el string para la firma según la documentación de Wompi
      const properties = event.signature.properties.sort()
      let concatenatedValues = ''
      const extractedValues: Record<string, any> = {}

      for (const prop of properties) {
        const keys = prop.split('.')
        let value: any = event

        for (const key of keys) {
          value = value[key]
          if (value === undefined) break
        }

        if (value !== undefined) {
          concatenatedValues += String(value)
          extractedValues[prop] = value
        }
      }

      // Calcular el checksum usando SHA256
      const dataToHash = concatenatedValues + this.eventsSecret
      const calculatedChecksum = crypto
        .createHash('sha256')
        .update(dataToHash)
        .digest('hex')

      const isValid = calculatedChecksum === event.signature.checksum

      if (!isValid) {
        logger.warn({ properties: event.signature.properties, extractedValues, concatenatedValues, secretLength: this.eventsSecret.length, expected: event.signature.checksum, calculated: calculatedChecksum }, '⚠️ Firma de webhook inválida')
      } else {
        logger.info('✅ Firma de webhook validada correctamente')
      }

      return isValid
    } catch (error) {
      logger.error({ error }, 'Error validating Wompi webhook signature')
      return false
    }
  }

  /**
   * Procesa un evento de webhook de Wompi
   * Aquí puedes implementar la lógica de negocio según el tipo de evento
   * 
   * @param event El evento del webhook
   * @returns Resultado del procesamiento
   */
  async processWebhookEvent(event: WompiWebhookEvent): Promise<{ success: boolean; message: string }> {
    // Check if transaction data exists
    if (!event.data || !event.data.transaction) {
      logger.error('❌ Evento sin datos de transacción')
      return { success: false, message: 'Faltan datos de transacción' }
    }

    logger.info({ event: event.event, transactionId: event.data.transaction.id, status: event.data.transaction.status, reference: event.data.transaction.reference }, '📬 Webhook de Wompi recibido')

    // Validar firma primero
    //    const isValidSignature = this.validateWebhookSignature(event)
    //    if (!isValidSignature && this.eventsSecret) {
    //      return { success: false, message: 'Invalid signature' }
    //    }

    const { transaction } = event.data

    // Extraer el orderId de la referencia (formato: ORDER-{orderId})
    const reference = transaction.reference
    if (!reference || !reference.startsWith('ORDER-')) {
      logger.error({ reference }, '❌ Referencia inválida')
      return { success: false, message: 'Invalid reference format' }
    }

    const orderId = reference.replace('ORDER-', '')
    logger.info({ orderId }, '🔗 Conectando webhook con orden')

    try {
      // Importar dinámicamente para evitar dependencias circulares
      const { updateOrderStatusWithPayment, getOrderById, getOrderUserId } = await import('./order.service.js')
      const { sendOrderEmail } = await import('./mail.service.js')
      const { assignKeysToUser } = await import('./product_key.service.js')

      // Aquí implementa tu lógica de negocio según el estado de la transacción
      switch (transaction.status) {
        case 'APPROVED':
          logger.info({ orderId }, '✅ Pago aprobado para orden')
          await updateOrderStatusWithPayment(orderId, 'confirmed', transaction.id)
          // Intentar asignar claves y enviar email con factura y claves
          try {
            const userId = await getOrderUserId(orderId)
            const order = userId ? await getOrderById(userId, Number(orderId)) : null

            if (!order) {
              logger.warn({ orderId }, '⚠️ No se encontró la orden')
              break
            }
            logger.info({ order }, 'Orden obtenida')

            const assignedKeysDetails: Array<{ 
              productId: string
              productName: string
              keys: Array<{ id: string, license_key: string }> 
            }> = []
            let totalKeysCount = 0

            // Asignar claves para cada producto
            if (Array.isArray(order.order_items)) {
              for (const item of order.order_items) {
                try {
                  const assigned = await assignKeysToUser(String(item.product_id), order.user_id, item.quantity)

                  if (assigned.length > 0) {
                    assignedKeysDetails.push({
                      productId: String(item.product_id),
                      productName: item.product?.name || `Producto #${item.product_id}`,
                      keys: assigned.map(k => ({ id: k.id, license_key: k.license_key }))
                    })
                    totalKeysCount += assigned.length
                  }
                } catch (e) {
                  logger.warn({ productId: item.product_id, error: e }, 'Error assigning keys for product')
                }
              }
            }

            // Preparar archivos adjuntos
            const attachments: Array<{ data: Buffer | string, filename: string, contentType?: string }> = []

            // 1. Generar archivo TXT con las claves (si hay claves)
            if (assignedKeysDetails.length > 0) {
              let keysFileContent = `╔════════════════════════════════════════════════════════════════╗
                  CLAVES DE LICENCIA - MERCADOR                 
                                                                
  Orden: ${reference.padEnd(52)} 
  Fecha: ${new Date().toLocaleDateString('es-CO').padEnd(52)} 
╚════════════════════════════════════════════════════════════════╝\n\n`

              assignedKeysDetails.forEach((product) => {
                keysFileContent += `\n${'='.repeat(64)}\n`
                keysFileContent += `PRODUCTO: ${product.productName}\n`
                keysFileContent += `ID: ${product.productId}\n`
                keysFileContent += `CANTIDAD: ${product.keys.length} clave(s)\n`
                keysFileContent += `${'='.repeat(64)}\n\n`

                product.keys.forEach((key, keyIdx) => {
                  keysFileContent += `  ${keyIdx + 1}. [ID: ${key.id}] ${key.license_key}\n`
                })
                keysFileContent += '\n'
              })

              keysFileContent += `\n${'='.repeat(64)}\n`
              keysFileContent += `IMPORTANTE:\n`
              keysFileContent += `- Guarda este archivo en un lugar seguro\n`
              keysFileContent += `- No compartas tus claves con nadie\n`
              keysFileContent += `- Cada clave es única y solo puede usarse una vez\n`
              keysFileContent += `- También puedes ver tus claves en tu perfil de Mercador\n`
              keysFileContent += `${'='.repeat(64)}\n`

              attachments.push({
                data: Buffer.from(keysFileContent, 'utf-8'),
                filename: `claves-orden-${orderId}.txt`,
                contentType: 'text/plain; charset=utf-8'
              })
            }

            // 2. Generar PDF de la factura (si está habilitado)
            if (ENABLE_PDF_ATTACH && order.order_items && order.order_items.length > 0) {
              try {
                // Preparar datos de la factura
                const invoiceItems = order.order_items.map(item => ({
                  product_id: item.product_id,
                  name: item.product?.name || `Producto #${item.product_id}`,
                  quantity: item.quantity,
                  price: item.price
                }))

                const subtotal = order.order_items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
                const tax = 0 // Calcular IVA si es necesario
                const total = subtotal + tax

                // Construir URL de la factura
                const invoiceUrl = new URL(`${FRONTEND_URL || 'http://localhost:3000'}/email/invoice`)
                invoiceUrl.searchParams.set('orderId', orderId)
                invoiceUrl.searchParams.set('reference', reference)
                invoiceUrl.searchParams.set('customerName', transaction.customer_data?.legal_id || transaction.customer_email)
                invoiceUrl.searchParams.set('customerEmail', transaction.customer_email)
                invoiceUrl.searchParams.set('items', JSON.stringify(invoiceItems))
                invoiceUrl.searchParams.set('subtotal', subtotal.toString())
                invoiceUrl.searchParams.set('tax', tax.toString())
                invoiceUrl.searchParams.set('total', total.toString())
                invoiceUrl.searchParams.set('paymentMethod', 'Wompi')
                invoiceUrl.searchParams.set('transactionId', transaction.id)
                invoiceUrl.searchParams.set('date', new Date().toISOString())
                invoiceUrl.searchParams.set('status', 'paid')

                // Nota: el PDF se genera en mail.service.ts usando Puppeteer
                logger.info({ invoiceUrl: invoiceUrl.toString().substring(0, 100) + '...' }, '📄 Factura PDF se generará desde')
              } catch (e) {
                logger.warn({ error: e }, '⚠️ Error preparando datos de factura')
              }
            }

            // 3. Enviar email con mensaje simple + adjuntos
            const emailTemplateUrl = `${FRONTEND_URL || 'http://localhost:3000'}/email/order-status`
            await sendOrderEmail({
              to: transaction.customer_email,
              subject: `✅ Orden ${reference} - Pago Confirmado`,
              templatePath: emailTemplateUrl,
              templateQuery: {
                reference,
                status: 'confirmed',
                keysCount: totalKeysCount.toString(),
                orderId,
                customerName: transaction.customer_data?.full_name || transaction.customer_email.split('@')[0]
              },
              attachPdf: ENABLE_PDF_ATTACH,
              pdfFilename: `factura-${orderId}.pdf`,
              attachments
            })

            logger.info({ to: transaction.customer_email, keysCount: totalKeysCount, attachmentsCount: attachments.length, pdfAttached: ENABLE_PDF_ATTACH }, '✅ Email enviado exitosamente')
          } catch (err) {
            logger.warn({ error: err }, 'No se pudo asignar claves o enviar email de confirmación')
          }
          // TODO: Liberar productos del inventario
          break

        case 'DECLINED':
          logger.info({ orderId }, '❌ Pago rechazado para orden')
          await updateOrderStatusWithPayment(orderId, 'cancelled', transaction.id)
          // Notificar al cliente del rechazo
          try {
            const frontendTemplateUrl = `${FRONTEND_URL || 'http://localhost:3000'}/email/order-status`
            await sendOrderEmail({
              to: transaction.customer_email,
              subject: `Orden ${reference} - Pago rechazado`,
              templatePath: frontendTemplateUrl,
              templateQuery: { reference, status: 'cancelled' },
              attachPdf: false
            })
          } catch (err) {
            logger.warn({ error: err }, 'No se pudo enviar email de rechazo')
          }
          // TODO: Restaurar items al carrito si es necesario
          break

        case 'PENDING':
          logger.info({ orderId }, '⏳ Pago pendiente para orden')
          await updateOrderStatusWithPayment(orderId, 'pending', transaction.id)
          break

        case 'VOIDED':
          logger.info({ orderId }, '🚫 Pago anulado para orden')
          await updateOrderStatusWithPayment(orderId, 'cancelled', transaction.id)
          // TODO: Revertir la orden
          break

        case 'ERROR':
          logger.info({ orderId }, '⚠️ Error en el pago para orden')
          await updateOrderStatusWithPayment(orderId, 'cancelled', transaction.id)
          // Registrar el error y notificar
          try {
            const frontendTemplateUrl = `${FRONTEND_URL || 'http://localhost:3000'}/email/order-status`
            await sendOrderEmail({
              to: transaction.customer_email,
              subject: `Orden ${reference} - Error en el pago`,
              templatePath: frontendTemplateUrl,
              templateQuery: { reference, status: 'error' },
              attachPdf: false
            })
          } catch (err) {
            logger.warn({ error: err }, 'No se pudo enviar email de error de pago')
          }
          break

        default:
          logger.info({ orderId, status: transaction.status }, '❓ Estado desconocido para orden')
      }

      return { success: true, message: `Order ${reference} updated to ${transaction.status}` }
    } catch (error) {
      logger.error({ orderId, error }, '❌ Error procesando webhook para orden')
      return { success: false, message: `Failed to update order ${orderId}: ${error instanceof Error ? error.message : 'Unknown error'}` }
    }
  }
}
