/**
 * @fileoverview Servicio para integración con Wompi - Pasarela de pagos
 * Maneja la creación de transaction intents, consultas de estado y validación de webhooks
 *
 * @author Equipo de Desarrollo Mercador
 * @version 1.0.0
 * @since 2024
 */

import { WOMPI_API_URL, WOMPI_PRIVATE_KEY, WOMPI_EVENTS_SECRET, WOMPI_REDIRECT_URL, API_URL } from '../config/env.js'
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

      for (const prop of properties) {
        const keys = prop.split('.')
        let value: any = event

        for (const key of keys) {
          value = value[key]
          if (value === undefined) break
        }

        if (value !== undefined) {
          concatenatedValues += String(value)
        }
      }

      // Calcular el checksum usando SHA256
      const calculatedChecksum = crypto
        .createHash('sha256')
        .update(concatenatedValues + this.eventsSecret)
        .digest('hex')

      const isValid = calculatedChecksum === event.signature.checksum

      if (!isValid) {
        console.warn('⚠️ Firma de webhook inválida')
        console.debug({
          expected: event.signature.checksum,
          calculated: calculatedChecksum,
        })
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
    console.log('📬 Webhook de Wompi recibido:', {
      event: event.event,
      transactionId: event.data.transaction.id,
      status: event.data.transaction.status,
      reference: event.data.transaction.reference,
    })

    // Validar firma primero
    const isValidSignature = this.validateWebhookSignature(event)
    if (!isValidSignature && this.eventsSecret) {
      return { success: false, message: 'Invalid signature' }
    }

    const { transaction } = event.data

    // Aquí implementa tu lógica de negocio según el estado de la transacción
    switch (transaction.status) {
      case 'APPROVED':
        console.log('✅ Pago aprobado:', transaction.reference)
        // TODO: Actualizar estado de la orden en tu base de datos
        // TODO: Enviar email de confirmación al cliente
        // TODO: Liberar productos del inventario
        break

      case 'DECLINED':
        console.log('❌ Pago rechazado:', transaction.reference)
        // TODO: Notificar al cliente del rechazo
        // TODO: Restaurar items al carrito si es necesario
        break

      case 'PENDING':
        console.log('⏳ Pago pendiente:', transaction.reference)
        // TODO: Actualizar estado a pendiente
        break

      case 'VOIDED':
        console.log('🚫 Pago anulado:', transaction.reference)
        // TODO: Revertir la orden
        break

      case 'ERROR':
        console.log('⚠️ Error en el pago:', transaction.reference)
        // TODO: Registrar el error y notificar
        break

      default:
        console.log('❓ Estado desconocido:', transaction.status)
    }

    return { success: true, message: 'Webhook processed successfully' }
  }
}
