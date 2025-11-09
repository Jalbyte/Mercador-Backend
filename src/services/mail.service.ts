import FormData from 'form-data'
import path from 'path'
import { Readable } from 'stream'
import { MAILGUN_API_KEY, MAILGUN_DOMAIN, ENABLE_PDF_ATTACH } from '../config/env.js'
import { generateInvoicePDF, type InvoiceData } from './pdf.service.js'
import { logger } from '../utils/logger.js'

// dynamic imports for heavy / optional dependencies
let Mailgun: any
let fetchFn: any
try {
  // mailgun.js expects you to call it as a function
  Mailgun = (await import('mailgun.js')).default
} catch (_) {
  // will throw at runtime if not installed
}

try {
  fetchFn = (await import('node-fetch')).default
} catch (_) {
}

const mailgunFactory = Mailgun ? new Mailgun(FormData) : null
const mg = mailgunFactory ? mailgunFactory.client({ username: 'api', key: MAILGUN_API_KEY || '' }) : null

export interface SendOrderEmailOptions {
  to: string
  subject: string
  templatePath: string // Full URL to frontend endpoint that returns HTML
  templateQuery?: Record<string, string>
  attachPdf?: boolean
  pdfFilename?: string
  attachments?: Array<{
    data: Buffer | string
    filename: string
    contentType?: string
  }>
}

async function fetchTemplateHtml(url: string): Promise<string> {
  const fetchToUse = fetchFn || globalThis.fetch
  if (!fetchToUse) throw new Error('fetch not available')
  const res = await fetchToUse(url)
  if (!res.ok) throw new Error(`Failed to fetch template HTML: ${res.status}`)
  return await res.text()
}

/**
 * Convierte un Buffer a Readable Stream para Mailgun
 */
function bufferToStream(buffer: Buffer): Readable {
  const readable = new Readable()
  readable.push(buffer)
  readable.push(null) // Indica el fin del stream
  return readable
}

export interface CheckoutItem {
  id: string
  name: string
  price: number
  quantity: number
}

export interface SendCheckoutEmailOptions {
  to: string
  orderId: string
  reference: string
  items: CheckoutItem[]
  total: number
  customerName: string
  customerEmail?: string
  customerPhone?: string
  paymentMethod?: string
  status?: 'confirmed' | 'pending' | 'cancelled'
  attachPdf?: boolean
}

export async function sendCheckoutEmail(opts: SendCheckoutEmailOptions): Promise<void> {
  const {
    to,
    orderId,
    reference,
    items,
    total,
    customerName,
    customerEmail,
    customerPhone,
    paymentMethod = 'Wompi',
    status = 'confirmed',
    attachPdf = false
  } = opts

  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'
  
  const templateQuery = {
    orderId,
    reference,
    items: JSON.stringify(items),
    total: total.toString(),
    customerName,
    ...(customerEmail && { customerEmail }),
    ...(customerPhone && { customerPhone }),
    paymentMethod,
    status,
    transactionDate: new Date().toISOString()
  }

  await sendOrderEmail({
    to,
    subject: status === 'confirmed' 
      ? `✅ Confirmación de compra - Orden ${reference}`
      : `📋 Resumen de compra - Orden ${reference}`,
    templatePath: `${FRONTEND_URL}/email/checkout`,
    templateQuery,
    attachPdf,
    pdfFilename: `factura-${reference}.pdf`
  })
}

export async function sendOrderEmail(opts: SendOrderEmailOptions): Promise<void> {
  const { to, subject, templatePath, templateQuery, attachPdf, pdfFilename, attachments } = opts

  // Build email template URL (for the HTML body)
  const emailUrl = new URL(templatePath)
  if (templateQuery) {
    for (const [k, v] of Object.entries(templateQuery)) emailUrl.searchParams.set(k, v)
  }

  // Fetch HTML for email body
  const html = await fetchTemplateHtml(emailUrl.toString())

  const message: any = {
    from: `No Reply <noreply@auth.mercador.app>`,
    to: [to],
    subject,
    html,
  }

  // Prepare attachments array
  const allAttachments: Array<any> = []

  // Generate PDF from invoice data if requested (usando PDFKit, no Puppeteer)
  if (attachPdf && templateQuery) {
    try {
      logger.info('Generando PDF de factura con PDFKit')
      
      // Extraer datos de la factura del templateQuery
      const invoiceData: InvoiceData = {
        orderId: templateQuery.orderId || '',
        reference: templateQuery.reference || '',
        customerName: templateQuery.customerName || '',
        customerEmail: templateQuery.customerEmail || '',
        items: templateQuery.items ? JSON.parse(templateQuery.items) : [],
        subtotal: parseFloat(templateQuery.subtotal || '0'),
        tax: parseFloat(templateQuery.tax || '0'),
        total: parseFloat(templateQuery.total || '0'),
        paymentMethod: templateQuery.paymentMethod || 'Wompi',
        transactionId: templateQuery.transactionId,
        date: templateQuery.date || new Date().toISOString(),
        status: (templateQuery.status as any) || 'confirmed'
      }
      
      // Generar PDF directamente con PDFKit (sin navegador)
      const pdf = await generateInvoicePDF(invoiceData)
      
      // Convertir Buffer a Stream para Mailgun
      allAttachments.push({
        filename: pdfFilename || 'factura.pdf',
        data: bufferToStream(pdf)
      })
      
      logger.info({ sizeKB: Math.round(pdf.length / 1024) }, 'PDF de factura generado exitosamente')
    } catch (e: any) {
      logger.warn({ err: e, message: (e && e.message) || e }, 'No se pudo generar PDF de factura')
    }
  }

  // Add custom attachments (like license keys TXT file)
  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      // Convertir a Buffer si es string
      const buffer = typeof att.data === 'string' 
        ? Buffer.from(att.data, 'utf-8') 
        : att.data
      
      // Convertir Buffer a Stream para Mailgun
      allAttachments.push({
        filename: att.filename,
        data: bufferToStream(buffer)
      })
    }
  }

  // Add attachments to message if any
  if (allAttachments.length > 0) {
    message.attachment = allAttachments
  }

  if (!mg) {
    throw new Error('Mailgun client not configured (MAILGUN_API_KEY missing)')
  }

  try {
    const result = await mg.messages.create(MAILGUN_DOMAIN, message)
    logger.info({
      to,
      subject,
      messageId: result.id,
      status: result.status || 'queued',
      domain: MAILGUN_DOMAIN
    }, 'Order email sent successfully')
    return result
  } catch (err: any) {
    logger.error({
      error: err,
      message: (err && err.message) || err,
      details: JSON.stringify(err, null, 2),
      domain: MAILGUN_DOMAIN,
      from: message.from,
      to
    }, 'Failed to send order email')
    throw err
  }
}

/**
 * Enviar correo de notificación de devolución (aprobada/rechazada)
 */
export interface SendReturnEmailOptions {
  to: string
  customerName: string
  returnId: number
  orderId: number
  orderReference: string
  status: 'approved' | 'rejected'
  refundAmount?: number
  refundPoints?: number
  refundMethod?: string
  adminNotes?: string
  reason?: string
}

export async function sendReturnEmail(opts: SendReturnEmailOptions): Promise<void> {
  const {
    to,
    customerName,
    returnId,
    orderId,
    orderReference,
    status,
    refundAmount,
    refundPoints,
    refundMethod,
    adminNotes,
    reason
  } = opts

  const statusText = status === 'approved' ? '✅ Aprobada' : '❌ Rechazada'
  const subject = `${statusText} - Solicitud de devolución #${returnId}`

  // Construir el HTML del correo directamente
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: ${status === 'approved' ? '#10b981' : '#ef4444'}; color: white; padding: 20px; text-align: center; border-radius: 8px; }
        .content { background: #f9fafb; padding: 20px; margin: 20px 0; border-radius: 8px; }
        .info-row { margin: 10px 0; }
        .label { font-weight: bold; color: #4b5563; }
        .value { color: #1f2937; }
        .footer { text-align: center; color: #6b7280; font-size: 14px; margin-top: 30px; }
        .refund-box { background: #ecfdf5; border-left: 4px solid #10b981; padding: 15px; margin: 15px 0; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${statusText}</h1>
        <p>Solicitud de Devolución #${returnId}</p>
      </div>
      
      <div class="content">
        <p>Hola <strong>${customerName}</strong>,</p>
        <p>Tu solicitud de devolución ha sido <strong>${status === 'approved' ? 'aprobada' : 'rechazada'}</strong>.</p>
        
        <div class="info-row">
          <span class="label">Devolución:</span>
          <span class="value">#${returnId}</span>
        </div>
        
        <div class="info-row">
          <span class="label">Orden:</span>
          <span class="value">#${orderId} (${orderReference})</span>
        </div>
  `

  if (status === 'approved') {
    html += `
        <div class="refund-box">
          <h3 style="margin-top: 0; color: #065f46;">💰 Información de Reembolso</h3>
    `
    
    if (refundAmount && refundAmount > 0) {
      html += `
          <div class="info-row">
            <span class="label">Monto en dinero:</span>
            <span class="value">$${refundAmount.toLocaleString('es-CO')} COP</span>
          </div>
      `
    }
    
    if (refundPoints && refundPoints > 0) {
      html += `
          <div class="info-row">
            <span class="label">Puntos reembolsados:</span>
            <span class="value">${refundPoints} puntos ($${(refundPoints * 10).toLocaleString('es-CO')} COP)</span>
          </div>
      `
    }
    
    if (refundMethod) {
      const methodText = refundMethod === 'original_payment' ? 'Método de pago original' : 
                        refundMethod === 'store_credit' ? 'Crédito en tienda' :
                        refundMethod === 'bank_transfer' ? 'Transferencia bancaria' : refundMethod
      html += `
          <div class="info-row">
            <span class="label">Método de reembolso:</span>
            <span class="value">${methodText}</span>
          </div>
      `
    }
    
    html += `
        </div>
        <p style="color: #065f46;">✅ Tu reembolso será procesado en los próximos días hábiles.</p>
    `
  } else {
    // Rechazada
    if (reason) {
      html += `
        <div class="info-row">
          <span class="label">Motivo de tu solicitud:</span>
          <span class="value">${reason}</span>
        </div>
      `
    }
  }

  if (adminNotes) {
    html += `
        <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 15px 0;">
          <h4 style="margin-top: 0; color: #92400e;">📝 Nota del equipo:</h4>
          <p style="margin: 0; color: #78350f;">${adminNotes}</p>
        </div>
    `
  }

  html += `
      </div>
      
      <div class="footer">
        <p>Gracias por tu preferencia</p>
        <p><strong>Mercador</strong></p>
        <p style="font-size: 12px;">Este es un correo automático, por favor no respondas a este mensaje.</p>
      </div>
    </body>
    </html>
  `

  const message: any = {
    from: `No Reply <noreply@auth.mercador.app>`,
    to: [to],
    subject,
    html,
  }

  if (!mg) {
    throw new Error('Mailgun client not configured (MAILGUN_API_KEY missing)')
  }

  try {
    const result = await mg.messages.create(MAILGUN_DOMAIN, message)
    logger.info({
      to,
      returnId,
      status,
      messageId: result.id,
    }, 'Return email sent successfully')
    return result
  } catch (err: any) {
    logger.error({
      error: err,
      message: (err && err.message) || err,
      returnId,
      to
    }, 'Failed to send return email')
    throw err
  }
}

export default {
  sendOrderEmail,
  sendCheckoutEmail,
  sendReturnEmail,
}
