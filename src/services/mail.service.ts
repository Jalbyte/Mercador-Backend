import FormData from 'form-data'
import path from 'path'
import { MAILGUN_API_KEY, MAILGUN_DOMAIN, ENABLE_PDF_ATTACH } from '../config/env.js'

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

// Optional puppeteer for PDF generation. We import lazily to avoid heavy startup cost.
let puppeteer: any = null
async function loadPuppeteer() {
  if (puppeteer) return puppeteer
  try {
    puppeteer = (await import('puppeteer')).default || (await import('puppeteer'))
    return puppeteer
  } catch (e) {
    puppeteer = null
    return null
  }
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
}

async function fetchTemplateHtml(url: string): Promise<string> {
  const fetchToUse = fetchFn || globalThis.fetch
  if (!fetchToUse) throw new Error('fetch not available')
  const res = await fetchToUse(url)
  if (!res.ok) throw new Error(`Failed to fetch template HTML: ${res.status}`)
  return await res.text()
}

async function generatePdfFromHtml(html: string): Promise<Buffer> {
  const pupp = await loadPuppeteer()
  if (!pupp) throw new Error('Puppeteer is not installed')
  const browser = await pupp.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdf: Buffer = await page.pdf({ format: 'A4', printBackground: true })
    return pdf
  } finally {
    await browser.close()
  }
}

export async function sendOrderEmail(opts: SendOrderEmailOptions): Promise<void> {
  const { to, subject, templatePath, templateQuery, attachPdf, pdfFilename } = opts

  // Build template URL
  const url = new URL(templatePath)
  if (templateQuery) {
    for (const [k, v] of Object.entries(templateQuery)) url.searchParams.set(k, v)
  }

  const html = await fetchTemplateHtml(url.toString())

  const message: any = {
    from: `No Reply <noreply@auth.mercador.app>`,
    to: [to],
    subject,
    html,
  }

  // Attach PDF if requested
  if (attachPdf) {
    try {
      const pdf = await generatePdfFromHtml(html)
      message.attachment = [
        {
          data: pdf,
          filename: pdfFilename || 'order.pdf',
        },
      ]
    } catch (e: any) {
      console.warn('Could not generate PDF attachment:', (e && e.message) || e)
    }
  }

  if (!mg) {
    throw new Error('Mailgun client not configured (MAILGUN_API_KEY missing)')
  }

  try {
    await mg.messages.create(MAILGUN_DOMAIN, message)
    console.log('✉️ Order email sent to', to)
  } catch (err: any) {
    console.error('Failed to send order email:', (err && err.message) || err)
    throw err
  }
}

export default {
  sendOrderEmail,
}
