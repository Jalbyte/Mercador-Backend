/**
 * Script de prueba para email de checkout/factura
 * 
 * Envía un email de prueba con productos de ejemplo
 * 
 * Uso:
 *   TEST_EMAIL=tu@email.com npm run test:checkout
 */

import { sendCheckoutEmail } from '../services/mail.service.js'

const TEST_EMAIL = process.env.TEST_EMAIL

if (!TEST_EMAIL) {
  console.error('❌ Error: Debes proporcionar TEST_EMAIL')
  console.log('Uso: TEST_EMAIL=tu@email.com npm run test:checkout')
  process.exit(1)
}

async function testCheckoutEmail() {
  console.log('🧪 Probando email de checkout...\n')
  console.log('📧 Destinatario:', TEST_EMAIL)
  console.log('⏳ Enviando...\n')

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

    console.log('✅ Email enviado exitosamente!\n')
    console.log('📝 Próximos pasos:')
    console.log('  1. Revisa tu bandeja de entrada:', TEST_EMAIL)
    console.log('  2. Revisa spam/promociones si no lo ves')
    console.log('  3. Deberías ver una factura detallada con 3 productos')
    console.log('  4. El PDF de la factura debe estar adjunto')
    console.log()
    console.log('🌐 Para ver la plantilla en el navegador:')
    console.log('  http://localhost:3000/email/checkout?orderId=12345&reference=ORDER-TEST-001&customerName=Juan%20P%C3%A9rez&total=255000&items=[{"id":"101","name":"Licencia%20Windows%2011%20Pro","price":85000,"quantity":2},{"id":"102","name":"Microsoft%20Office%20365","price":50000,"quantity":1},{"id":"103","name":"Antivirus%20Norton%20360","price":35000,"quantity":1}]')
    console.log()

  } catch (error: any) {
    console.error('❌ Error al enviar email:', error.message)
    console.error('\n📋 Detalles del error:')
    console.error(error)
    console.error('\n🔧 Soluciones posibles:')
    console.error('  1. Verifica que MAILGUN_API_KEY esté configurado en .env')
    console.error('  2. Verifica que MAILGUN_DOMAIN esté configurado en .env')
    console.error('  3. Asegúrate de que el frontend esté corriendo (npm run dev)')
    console.error('  4. Ejecuta: npm run debug:mailgun para más diagnósticos')
    process.exit(1)
  }
}

testCheckoutEmail().catch(console.error)
