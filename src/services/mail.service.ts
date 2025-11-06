import FormData from 'form-data'
import path from 'path'
import { Readable } from 'stream'
import { MAILGUN_API_KEY, MAILGUN_DOMAIN, ENABLE_PDF_ATTACH } from '../config/env.js'
import { generateInvoicePDF, type InvoiceData } from './pdf.service.js'

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
      console.log('📄 Generando PDF de factura con PDFKit...')
      
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
      
      console.log('✅ PDF de factura generado exitosamente (' + Math.round(pdf.length / 1024) + ' KB)')
    } catch (e: any) {
      console.warn('⚠️ No se pudo generar PDF de factura:', (e && e.message) || e)
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
    console.log('✉️ Order email sent successfully!')
    console.log('  📧 To:', to)
    console.log('  📝 Subject:', subject)
    console.log('  🆔 Mailgun Message ID:', result.id)
    console.log('  📊 Status:', result.status || 'queued')
    console.log('  🔗 Check logs at: https://app.mailgun.com/app/sending/domains/' + MAILGUN_DOMAIN + '/logs')
    return result
  } catch (err: any) {
    console.error('❌ Failed to send order email!')
    console.error('  Error:', (err && err.message) || err)
    console.error('  Details:', JSON.stringify(err, null, 2))
    console.error('  Domain:', MAILGUN_DOMAIN)
    console.error('  From:', message.from)
    console.error('  To:', to)
    throw err
  }
}

export default {
  sendOrderEmail,
  sendCheckoutEmail,
}
