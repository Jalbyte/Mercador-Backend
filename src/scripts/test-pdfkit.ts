#!/usr/bin/env node
/**
 * Test script para probar la generación de PDFs con PDFKit
 * 
 * Uso:
 *   npm run test:pdfkit
 */

import { generateInvoicePDF } from '../services/pdf.service.js'
import fs from 'fs'
import path from 'path'
import { logger } from '../utils/logger.js'

async function testPDFKit() {
  logger.info('🧪 Iniciando test de PDFKit...\n')
  
  try {
    // Datos de prueba de una factura
    const testInvoiceData = {
      orderId: '123',
      reference: 'ORDER-123-TEST',
      customerName: 'Juan Manuel Amador',
      customerEmail: 'juanm.amadorr@uqvirtual.edu.co',
      items: [
        {
          id: '1',
          name: 'Microsoft Windows 11 Pro - Licencia Original',
          price: 89900,
          quantity: 1
        },
        {
          id: '2',
          name: 'Microsoft Office 365 Personal - 1 Año',
          price: 45000,
          quantity: 2
        },
        {
          id: '3',
          name: 'Adobe Creative Cloud - Suscripción Mensual',
          price: 120000,
          quantity: 1
        }
      ],
      subtotal: 329900,
      tax: 0,
      total: 329900,
      paymentMethod: 'Wompi',
      transactionId: '11984559-1762188169-58416',
      date: new Date().toISOString(),
      status: 'confirmed' as const
    }

  logger.info('📋 Datos de la factura:')
  logger.info({ customer: testInvoiceData.customerName, email: testInvoiceData.customerEmail, products: testInvoiceData.items.length, total: testInvoiceData.total }, 'Invoice data')

  logger.info('📄 Generando PDF con PDFKit...')
    const startTime = Date.now()
    
    const pdfBuffer = await generateInvoicePDF(testInvoiceData)
    
    const endTime = Date.now()
    const timeElapsed = endTime - startTime

  logger.info('✅ PDF generado exitosamente!')
  logger.info({ sizeKb: Math.round(pdfBuffer.length / 1024), timeMs: timeElapsed }, 'PDF generated')

    // Guardar el PDF para revisarlo manualmente
    const outputPath = path.join(process.cwd(), 'test-invoice-pdfkit.pdf')
    fs.writeFileSync(outputPath, pdfBuffer)
  logger.info({ outputPath }, '💾 PDF guardado en')
  logger.info('Puedes abrirlo para verificar el diseño')

    // Estadísticas finales
  logger.info('📊 Estadísticas:')
  logger.info({ noChromium: true, noHeadless: true, generation: 'PDFKit', timeMs: timeElapsed, sizeKb: Math.round(pdfBuffer.length / 1024), memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) }, 'Statistics')

  logger.info('🎉 Test completado exitosamente!')
  logger.info('✅ PDFKit está funcionando correctamente.')
  logger.info('✅ Los PDFs de facturas se generarán sin navegador.')
  logger.info('✅ Mucho más rápido y ligero que Puppeteer.')

    process.exit(0)
  } catch (error) {
    logger.error({ err: error }, '❌ Error en el test de PDFKit')
    logger.error('📋 Troubleshooting: 1) Verifica que PDFKit esté instalado: npm install pdfkit @types/pdfkit; 2) Verifica que el servicio pdf.service.ts esté compilado; 3) Ejecuta: npm run build')
    process.exit(1)
  }
}

testPDFKit()
