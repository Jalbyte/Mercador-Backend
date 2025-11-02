#!/usr/bin/env tsx
/**
 * Script de prueba para el servicio de email
 * 
 * Este script prueba el envío de emails con y sin PDF adjunto
 * 
 * Uso:
 *   npm run test:email
 *   
 * O directamente:
 *   tsx scripts/test-email-service.ts
 */

import { sendOrderEmail } from '../src/services/mail.service.js'
import { FRONTEND_URL, ENABLE_PDF_ATTACH } from '../src/config/env.js'

async function testEmailService() {
  console.log('🧪 Iniciando prueba del servicio de email...\n')

  // Datos de prueba
  const testEmail = process.env.TEST_EMAIL || 'test@example.com'
  const reference = `ORDER-TEST-${Date.now()}`
  
  console.log('📋 Configuración:')
  console.log(`  - Email destino: ${testEmail}`)
  console.log(`  - Referencia: ${reference}`)
  console.log(`  - Frontend URL: ${FRONTEND_URL}`)
  console.log(`  - PDF Attach habilitado: ${ENABLE_PDF_ATTACH}`)
  console.log()

  try {
    console.log('📬 Enviando email de prueba...')
    
    await sendOrderEmail({
      to: testEmail,
      subject: `Test - Orden ${reference}`,
      templatePath: `${FRONTEND_URL || 'http://localhost:3000'}/email/order-status`,
      templateQuery: {
        reference,
        status: 'confirmed',
        assigned: JSON.stringify({ '101': 2, '102': 1 })
      },
      attachPdf: ENABLE_PDF_ATTACH,
      pdfFilename: `test-${reference}.pdf`
    })

    console.log('✅ Email enviado exitosamente!')
    console.log()
    console.log('📧 Revisa tu bandeja de entrada:', testEmail)
    console.log('   Si no llega, revisa la carpeta de spam.')
    
  } catch (error: any) {
    console.error('❌ Error al enviar email:', error.message)
    console.error()
    console.error('💡 Posibles causas:')
    console.error('   1. MAILGUN_API_KEY no configurada o inválida')
    console.error('   2. MAILGUN_DOMAIN no verificado en Mailgun')
    console.error('   3. Frontend no está corriendo (si ENABLE_PDF_ATTACH=true)')
    console.error('   4. Puppeteer no instalado (si ENABLE_PDF_ATTACH=true)')
    console.error()
    console.error('🔧 Soluciones:')
    console.error('   - Verifica las variables en .env')
    console.error('   - Ejecuta: npm install mailgun.js puppeteer')
    console.error('   - Inicia el frontend: cd ../frontend && npm run dev')
    
    process.exit(1)
  }
}

// Ejecutar test
testEmailService()
  .then(() => {
    console.log('🎉 Test completado!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('💥 Error inesperado:', error)
    process.exit(1)
  })
