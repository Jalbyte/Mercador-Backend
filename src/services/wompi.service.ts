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
      console.warn('⚠️ WOMPI_PRIVATE_KEY no está configurada')
    }

    if (!this.eventsSecret) {
      console.warn('⚠️ WOMPI_EVENTS_SECRET (Integrity Secret) no está configurada - requerida para generar firma de integridad del widget')
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

    console.log('🔐 Firma de integridad (Widget) generada para:', {
      reference,
      amountInCents,
      currency,
      type: 'WIDGET_EMBED',
      signature,
    })

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

    console.log('🔐 Firma de integridad (API) generada para:', {
      reference,
      amountInCents,
      currency,
      type: 'API_TRANSACTIONS',
      signature,
    })

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
      console.error('Error fetching Wompi transaction status (public):', error)
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
      console.error('Error fetching Wompi transaction status (private):', error)
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
      console.warn('⚠️ WOMPI_EVENTS_SECRET no está configurado, no se puede validar firma')
      return false
    }

    if (!event.signature || !event.signature.checksum || !event.signature.properties) {
      console.warn('⚠️ El evento no contiene firma')
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
        console.warn('⚠️ Firma de webhook inválida')
        console.debug('🔍 Detalles de validación:', {
          properties: event.signature.properties,
          extractedValues,
          concatenatedValues,
          secretLength: this.eventsSecret.length,
          dataToHash: `${concatenatedValues}[SECRET:${this.eventsSecret.substring(0, 10)}...]`,
          expected: event.signature.checksum,
          calculated: calculatedChecksum,
        })
      } else {
        console.log('✅ Firma de webhook validada correctamente')
      }

      return isValid
    } catch (error) {
      console.error('Error validating Wompi webhook signature:', error)
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
      console.error('❌ Evento sin datos de transacción')
      return { success: false, message: 'Faltan datos de transacción' }
    }

    console.log('📬 Webhook de Wompi recibido:', {
      event: event.event,
      transactionId: event.data.transaction.id,
      status: event.data.transaction.status,
      reference: event.data.transaction.reference,
    })

    // Validar firma primero
//    const isValidSignature = this.validateWebhookSignature(event)
//    if (!isValidSignature && this.eventsSecret) {
//      return { success: false, message: 'Invalid signature' }
//    }

    const { transaction } = event.data

    // Extraer el orderId de la referencia (formato: ORDER-{orderId})
    const reference = transaction.reference
    if (!reference || !reference.startsWith('ORDER-')) {
      console.error('❌ Referencia inválida:', reference)
      return { success: false, message: 'Invalid reference format' }
    }

    const orderId = reference.replace('ORDER-', '')
    console.log('🔗 Conectando webhook con orden:', orderId)

    try {
      // Importar dinámicamente para evitar dependencias circulares
  const { updateOrderStatusWithPayment, getOrderById, getOrderUserId } = await import('./order.service.js')
  const { sendOrderEmail } = await import('./mail.service.js')
  const { assignKeysToUser } = await import('./product_key.service.js')

      // Aquí implementa tu lógica de negocio según el estado de la transacción
      switch (transaction.status) {
        case 'APPROVED':
          console.log('✅ Pago aprobado para orden:', orderId)
          await updateOrderStatusWithPayment(orderId, 'confirmed', transaction.id)
          // Intentar asignar claves y enviar email con factura y claves
          try {
            const userId = await getOrderUserId(orderId)
            const order = userId ? await getOrderById(userId, Number(orderId)) : null
            
            if (!order) {
              console.warn('⚠️ No se encontró la orden:', orderId)
              break
            }

            const assignedKeysDetails: Array<{ productId: string, productName: string, keys: string[] }> = []
            let totalKeysCount = 0
            
            // Asignar claves para cada producto
            if (Array.isArray(order.items)) {
              for (const item of order.items) {
                try {
                  const assigned = await assignKeysToUser(String(item.product_id), order.user_id, item.quantity)
                  
                  if (assigned.length > 0) {
                    assignedKeysDetails.push({
                      productId: String(item.product_id),
                      productName: item.product?.name || `Producto #${item.product_id}`,
                      keys: assigned.map(k => k.license_key)
                    })
                    totalKeysCount += assigned.length
                  }
                } catch (e) {
                  console.warn('Error assigning keys for product', item.product_id, e)
                }
              }
            }

            // Preparar archivos adjuntos
            const attachments: Array<{ data: Buffer | string, filename: string, contentType?: string }> = []
            
            // 1. Generar archivo TXT con las claves (si hay claves)
            if (assignedKeysDetails.length > 0) {
              let keysFileContent = `╔════════════════════════════════════════════════════════════════╗
║                  CLAVES DE LICENCIA - MERCADOR                 ║
║                                                                ║
║  Orden: ${reference.padEnd(52)} ║
║  Fecha: ${new Date().toLocaleDateString('es-CO').padEnd(52)} ║
╚════════════════════════════════════════════════════════════════╝\n\n`
              
              assignedKeysDetails.forEach((product) => {
                keysFileContent += `\n${'='.repeat(64)}\n`
                keysFileContent += `PRODUCTO: ${product.productName}\n`
                keysFileContent += `ID: ${product.productId}\n`
                keysFileContent += `CANTIDAD: ${product.keys.length} clave(s)\n`
                keysFileContent += `${'='.repeat(64)}\n\n`
                
                product.keys.forEach((key, keyIdx) => {
                  keysFileContent += `  ${keyIdx + 1}. ${key}\n`
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
            if (ENABLE_PDF_ATTACH && order.items && order.items.length > 0) {
              try {
                // Preparar datos de la factura
                const invoiceItems = order.items.map(item => ({
                  product_id: item.product_id,
                  name: item.product?.name || `Producto #${item.product_id}`,
                  quantity: item.quantity,
                  price: item.price
                }))

                const subtotal = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
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
                console.log('📄 Factura PDF se generará desde:', invoiceUrl.toString().substring(0, 100) + '...')
              } catch (e) {
                console.warn('⚠️ Error preparando datos de factura:', e)
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
            
            console.log(`✅ Email enviado exitosamente`)
            console.log(`   📧 Destinatario: ${transaction.customer_email}`)
            console.log(`   🔑 Claves asignadas: ${totalKeysCount}`)
            console.log(`   📎 Adjuntos: ${attachments.length} archivo(s) + ${ENABLE_PDF_ATTACH ? '1 PDF' : '0 PDF'}`)
          } catch (err) {
            console.warn('No se pudo asignar claves o enviar email de confirmación:', err)
          }
          // TODO: Liberar productos del inventario
          break

        case 'DECLINED':
          console.log('❌ Pago rechazado para orden:', orderId)
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
            console.warn('No se pudo enviar email de rechazo:', err)
          }
          // TODO: Restaurar items al carrito si es necesario
          break

        case 'PENDING':
          console.log('⏳ Pago pendiente para orden:', orderId)
          await updateOrderStatusWithPayment(orderId, 'pending', transaction.id)
          break

        case 'VOIDED':
          console.log('🚫 Pago anulado para orden:', orderId)
          await updateOrderStatusWithPayment(orderId, 'cancelled', transaction.id)
          // TODO: Revertir la orden
          break

        case 'ERROR':
          console.log('⚠️ Error en el pago para orden:', orderId)
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
            console.warn('No se pudo enviar email de error de pago:', err)
          }
          break

        default:
          console.log('❓ Estado desconocido para orden:', orderId, transaction.status)
      }

      return { success: true, message: `Order ${reference} updated to ${transaction.status}` }
    } catch (error) {
      console.error('❌ Error procesando webhook para orden:', orderId, error)
      return { success: false, message: `Failed to update order ${orderId}: ${error instanceof Error ? error.message : 'Unknown error'}` }
    }
  }
}
