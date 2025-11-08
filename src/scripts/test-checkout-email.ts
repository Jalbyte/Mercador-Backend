/**
 * Script de prueba para email de checkout/factura
 * 
 * Envía un email de prueba con productos de ejemplo
 * 
 * Uso:
 *   TEST_EMAIL=tu@email.com npm run test:checkout
 */

import { sendCheckoutEmail } from '../services/mail.service.js'
import { logger } from '../utils/logger.js'

const TEST_EMAIL = process.env.TEST_EMAIL

if (!TEST_EMAIL) {
  logger.error('❌ Error: Debes proporcionar TEST_EMAIL')
  logger.info('Uso: TEST_EMAIL=tu@email.com npm run test:checkout')
  process.exit(1)
}

async function testCheckoutEmail() {
  logger.info('🧪 Probando email de checkout...\n')
  logger.info({ TEST_EMAIL }, '📧 Destinatario')
  logger.info('⏳ Enviando...\n')

  try {
    await sendCheckoutEmail({
      to: TEST_EMAIL!,
      orderId: '12345',
      reference: 'ORDER-TEST-001',
      customerName: 'Juan Pérez',
      customerEmail: TEST_EMAIL,
      customerPhone: '+57 300 123 4567',
      paymentMethod: 'Wompi - Tarjeta de crédito',
      status: 'confirmed',
      total: 255000,
      items: [
        {
          id: '101',
          name: 'Licencia Windows 11 Pro',
          price: 85000,
          quantity: 2
        },
        {
          id: '102',
          name: 'Microsoft Office 365',
          price: 50000,
          quantity: 1
        },
        {
          id: '103',
          name: 'Antivirus Norton 360',
          price: 35000,
          quantity: 1
        }
      ],
      attachPdf: true
    })

  logger.info('✅ Email enviado exitosamente!\n')
  logger.info('📝 Próximos pasos:')
  logger.info({ TEST_EMAIL }, 'Revisa tu bandeja de entrada')
  logger.info('Revisa spam/promociones si no lo ves')
  logger.info('Deberías ver una factura detallada con 3 productos')
  logger.info('El PDF de la factura debe estar adjunto')
  logger.info('🌐 Para ver la plantilla en el navegador:')
  logger.info('http://localhost:3000/email/checkout?orderId=12345&reference=ORDER-TEST-001&customerName=Juan%20P%C3%A9rez&total=255000&items=[{"id":"101","name":"Licencia%20Windows%2011%20Pro","price":85000,"quantity":2},{"id":"102","name":"Microsoft%20Office%20365","price":50000,"quantity":1},{"id":"103","name":"Antivirus%20Norton%20360","price":35000,"quantity":1}]')

  } catch (error: any) {
    logger.error({ err: error }, '❌ Error al enviar email')
    logger.debug({ error })
    logger.error('🔧 Soluciones posibles: 1) Verifica que MAILGUN_API_KEY esté configurado; 2) Verifica que MAILGUN_DOMAIN esté configurado; 3) Asegúrate de que el frontend esté corriendo; 4) Ejecuta: npm run debug:mailgun')
    process.exit(1)
  }
}

testCheckoutEmail().catch((err) => logger.error({ err }, 'testCheckoutEmail unexpected error'))
