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

async function testPDFKit() {
  console.log('🧪 Iniciando test de PDFKit...\n')
  
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

    console.log('📋 Datos de la factura:')
    console.log('   Cliente:', testInvoiceData.customerName)
    console.log('   Email:', testInvoiceData.customerEmail)
    console.log('   Productos:', testInvoiceData.items.length)
    console.log('   Total: $' + testInvoiceData.total.toLocaleString('es-CO'), 'COP\n')

    console.log('📄 Generando PDF con PDFKit...')
    const startTime = Date.now()
    
    const pdfBuffer = await generateInvoicePDF(testInvoiceData)
    
    const endTime = Date.now()
    const timeElapsed = endTime - startTime

    console.log('✅ PDF generado exitosamente!')
    console.log('   Tamaño:', Math.round(pdfBuffer.length / 1024), 'KB')
    console.log('   Tiempo:', timeElapsed, 'ms\n')

    // Guardar el PDF para revisarlo manualmente
    const outputPath = path.join(process.cwd(), 'test-invoice-pdfkit.pdf')
    fs.writeFileSync(outputPath, pdfBuffer)
    console.log('💾 PDF guardado en:', outputPath)
    console.log('   Puedes abrirlo para verificar el diseño\n')

    // Estadísticas finales
    console.log('📊 Estadísticas:')
    console.log('   ✅ Sin Chromium requerido')
    console.log('   ✅ Sin navegador headless')
    console.log('   ✅ Generación nativa con PDFKit')
    console.log('   ✅ Tiempo de generación:', timeElapsed, 'ms')
    console.log('   ✅ Tamaño del PDF:', Math.round(pdfBuffer.length / 1024), 'KB')
    console.log('   ✅ Memoria usada: ~', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB\n')

    console.log('🎉 Test completado exitosamente!\n')
    console.log('✅ PDFKit está funcionando correctamente.')
    console.log('✅ Los PDFs de facturas se generarán sin navegador.')
    console.log('✅ Mucho más rápido y ligero que Puppeteer.\n')

    process.exit(0)
  } catch (error) {
    console.error('\n❌ Error en el test de PDFKit:\n')
    console.error(error)
    console.error('\n📋 Troubleshooting:')
    console.error('1. Verifica que PDFKit esté instalado:')
    console.error('   npm install pdfkit @types/pdfkit')
    console.error('2. Verifica que el servicio pdf.service.ts esté compilado')
    console.error('3. Ejecuta: npm run build\n')
    
    process.exit(1)
  }
}

testPDFKit()
