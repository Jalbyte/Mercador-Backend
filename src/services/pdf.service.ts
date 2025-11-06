/**
 * Servicio de Generación de PDFs sin Navegador
 * 
 * Usa PDFKit para generar facturas profesionales directamente,
 * sin necesidad de Puppeteer/Chrome (~2MB vs ~170MB)
 */

import PDFDocument from 'pdfkit'
import { Readable } from 'stream'

export interface InvoiceItem {
  id: string
  name: string
  price: number
  quantity: number
}

export interface InvoiceData {
  orderId: string
  reference: string
  customerName: string
  customerEmail: string
  items: InvoiceItem[]
  subtotal: number
  tax: number
  total: number
  paymentMethod: string
  transactionId?: string
  date: string
  status: 'confirmed' | 'pending' | 'cancelled'
}

/**
 * Genera un PDF de factura profesional usando PDFKit
 */
export async function generateInvoicePDF(data: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: `Factura ${data.reference}`,
          Author: 'Mercador',
          Subject: `Factura de compra - Orden ${data.orderId}`,
        }
      })

      const chunks: Buffer[] = []
      doc.on('data', (chunk: Buffer) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      // === HEADER CON GRADIENTE SIMULADO ===
      const pageWidth = doc.page.width
      const pageHeight = doc.page.height
      
      // Fondo de header (azul degradado simulado con rectángulos)
      doc.rect(0, 0, pageWidth, 150)
         .fill('#667eea')
      
      doc.rect(0, 50, pageWidth, 100)
         .fillOpacity(0.8)
         .fill('#764ba2')
         .fillOpacity(1)

      // Logo/Título
      doc.fontSize(32)
         .fillColor('#ffffff')
         .font('Helvetica-Bold')
         .text('MERCADOR', 50, 40, { align: 'left' })
      
      doc.fontSize(12)
         .fillColor('#e0e7ff')
         .font('Helvetica')
         .text('Licencias de Software', 50, 80)

      // Número de factura y fecha (derecha)
      doc.fontSize(14)
         .fillColor('#ffffff')
         .font('Helvetica-Bold')
         .text(`Factura #${data.reference}`, pageWidth - 250, 40, { 
           width: 200, 
           align: 'right' 
         })
      
      doc.fontSize(10)
         .fillColor('#e0e7ff')
         .font('Helvetica')
         .text(new Date(data.date).toLocaleDateString('es-CO', {
           year: 'numeric',
           month: 'long',
           day: 'numeric'
         }), pageWidth - 250, 60, { 
           width: 200, 
           align: 'right' 
         })

      // Estado de la orden
      const statusColors = {
        confirmed: '#10b981',
        pending: '#f59e0b',
        cancelled: '#ef4444'
      }
      const statusText = {
        confirmed: '✓ PAGADO',
        pending: '⏳ PENDIENTE',
        cancelled: '✗ CANCELADO'
      }
      
      doc.fontSize(11)
         .fillColor('#ffffff')
         .rect(pageWidth - 180, 85, 130, 25)
         .fill(statusColors[data.status])
         .fillColor('#ffffff')
         .font('Helvetica-Bold')
         .text(statusText[data.status], pageWidth - 175, 92, {
           width: 120,
           align: 'center'
         })

      // === INFORMACIÓN DEL CLIENTE ===
      let yPos = 180

      doc.fontSize(12)
         .fillColor('#1f2937')
         .font('Helvetica-Bold')
         .text('Facturado a:', 50, yPos)

      yPos += 20
      doc.fontSize(10)
         .fillColor('#4b5563')
         .font('Helvetica')
         .text(data.customerName, 50, yPos)
      
      yPos += 15
      doc.text(data.customerEmail, 50, yPos)

      // Información de pago (derecha)
      yPos = 180
      doc.fontSize(12)
         .fillColor('#1f2937')
         .font('Helvetica-Bold')
         .text('Método de pago:', pageWidth - 250, yPos, { width: 200, align: 'right' })

      yPos += 20
      doc.fontSize(10)
         .fillColor('#4b5563')
         .font('Helvetica')
         .text(data.paymentMethod, pageWidth - 250, yPos, { width: 200, align: 'right' })

      if (data.transactionId) {
        yPos += 15
        doc.fontSize(9)
           .fillColor('#9ca3af')
           .text(`ID: ${data.transactionId}`, pageWidth - 250, yPos, { 
             width: 200, 
             align: 'right' 
           })
      }

      // === LÍNEA SEPARADORA ===
      yPos = 260
      doc.strokeColor('#e5e7eb')
         .lineWidth(1)
         .moveTo(50, yPos)
         .lineTo(pageWidth - 50, yPos)
         .stroke()

      // === TABLA DE PRODUCTOS ===
      yPos += 30

      // Headers de tabla
      doc.fontSize(10)
         .fillColor('#6b7280')
         .font('Helvetica-Bold')
         .text('Producto', 50, yPos)
         .text('Cantidad', pageWidth - 250, yPos, { width: 60, align: 'center' })
         .text('Precio Unit.', pageWidth - 180, yPos, { width: 80, align: 'right' })
         .text('Subtotal', pageWidth - 90, yPos, { width: 80, align: 'right' })

      yPos += 20
      
      // Línea bajo headers
      doc.strokeColor('#e5e7eb')
         .lineWidth(0.5)
         .moveTo(50, yPos)
         .lineTo(pageWidth - 50, yPos)
         .stroke()

      // Items de la tabla
      yPos += 15
      doc.font('Helvetica')
         .fillColor('#1f2937')

      for (const item of data.items) {
        // Verificar si necesitamos nueva página
        if (yPos > pageHeight - 200) {
          doc.addPage()
          yPos = 50
        }

        const itemTotal = item.price * item.quantity

        doc.fontSize(10)
           .text(item.name, 50, yPos, { width: pageWidth - 400 })
           .text(item.quantity.toString(), pageWidth - 250, yPos, { 
             width: 60, 
             align: 'center' 
           })
           .text(`$${item.price.toLocaleString('es-CO')}`, pageWidth - 180, yPos, { 
             width: 80, 
             align: 'right' 
           })
           .text(`$${itemTotal.toLocaleString('es-CO')}`, pageWidth - 90, yPos, { 
             width: 80, 
             align: 'right' 
           })

        yPos += 30
      }

      // === TOTALES ===
      yPos += 20

      // Línea separadora antes de totales
      doc.strokeColor('#e5e7eb')
         .lineWidth(0.5)
         .moveTo(pageWidth - 300, yPos)
         .lineTo(pageWidth - 50, yPos)
         .stroke()

      yPos += 20

      // Subtotal
      doc.fontSize(10)
         .fillColor('#6b7280')
         .font('Helvetica')
         .text('Subtotal:', pageWidth - 200, yPos, { width: 100, align: 'right' })
         .fillColor('#1f2937')
         .text(`$${data.subtotal.toLocaleString('es-CO')}`, pageWidth - 90, yPos, { 
           width: 80, 
           align: 'right' 
         })

      yPos += 20

      // Tax (si aplica)
      if (data.tax > 0) {
        doc.fillColor('#6b7280')
           .text('IVA:', pageWidth - 200, yPos, { width: 100, align: 'right' })
           .fillColor('#1f2937')
           .text(`$${data.tax.toLocaleString('es-CO')}`, pageWidth - 90, yPos, { 
             width: 80, 
             align: 'right' 
           })
        
        yPos += 20
      }

      // Línea antes del total
      doc.strokeColor('#667eea')
         .lineWidth(2)
         .moveTo(pageWidth - 300, yPos)
         .lineTo(pageWidth - 50, yPos)
         .stroke()

      yPos += 15

      // TOTAL (destacado)
      doc.fontSize(14)
         .fillColor('#667eea')
         .font('Helvetica-Bold')
         .text('TOTAL:', pageWidth - 200, yPos, { width: 100, align: 'right' })
         .fontSize(16)
         .text(`$${data.total.toLocaleString('es-CO')} COP`, pageWidth - 90, yPos, { 
           width: 80, 
           align: 'right' 
         })

      // === FOOTER ===
      const footerY = pageHeight - 100

      // Caja de información
      doc.rect(50, footerY, pageWidth - 100, 60)
         .fillOpacity(0.05)
         .fill('#667eea')
         .fillOpacity(1)

      doc.fontSize(9)
         .fillColor('#6b7280')
         .font('Helvetica')
         .text('Gracias por tu compra', 50, footerY + 10, {
           width: pageWidth - 100,
           align: 'center'
         })

      doc.fontSize(8)
         .text('Esta es una factura electrónica válida', 50, footerY + 25, {
           width: pageWidth - 100,
           align: 'center'
         })

      doc.fontSize(8)
         .fillColor('#9ca3af')
         .text('Mercador - Licencias de Software | https://mercador.app', 50, footerY + 40, {
           width: pageWidth - 100,
           align: 'center'
         })

      // Finalizar documento
      doc.end()
    } catch (error) {
      reject(error)
    }
  })
}

/**
 * Convierte Buffer a Stream (para Mailgun)
 */
export function bufferToStream(buffer: Buffer): Readable {
  const readable = new Readable()
  readable.push(buffer)
  readable.push(null)
  return readable
}

export default {
  generateInvoicePDF,
  bufferToStream
}
