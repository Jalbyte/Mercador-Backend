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
import { logger } from '../src/utils/logger.js'

async function testEmailService() {
  logger.info('🧪 Iniciando prueba del servicio de email...\n')

  // Datos de prueba
  const testEmail = process.env.TEST_EMAIL || 'test@example.com'
  const reference = `ORDER-TEST-${Date.now()}`
  
  logger.info('📋 Configuración:')
  logger.info({ testEmail, reference, FRONTEND_URL, ENABLE_PDF_ATTACH }, 'Email test configuration')

  try {
  logger.info('📬 Enviando email de prueba...')
    
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

  logger.info('✅ Email enviado exitosamente!')
  logger.info({ testEmail }, 'Revisa tu bandeja de entrada')
    
  } catch (error: any) {
  logger.error({ message: error?.message, stack: error?.stack }, '❌ Error al enviar email')
  logger.error('💡 Posibles causas: 1. MAILGUN_API_KEY no configurada o inválida; 2. MAILGUN_DOMAIN no verificado; 3. Frontend no está corriendo; 4. Puppeteer no instalado')
  logger.error('🔧 Soluciones: - Verifica las variables en .env - Ejecuta: npm install mailgun.js puppeteer - Inicia el frontend: cd ../frontend && npm run dev')
    
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
