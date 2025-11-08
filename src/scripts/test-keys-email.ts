/**
 * Script de prueba para enviar email con claves adjuntas
 * 
 * Simula el envío de un email de orden confirmada con archivo de claves
 * 
 * Uso:
 *   TEST_EMAIL=tu@email.com npm run test:keys-email
 */

import { sendOrderEmail } from '../services/mail.service.js'
import { FRONTEND_URL } from '../config/env.js'
import { logger } from '../utils/logger.js'

const TEST_EMAIL = process.env.TEST_EMAIL

if (!TEST_EMAIL) {
  logger.error('❌ Error: Debes proporcionar TEST_EMAIL')
  logger.info('Uso: TEST_EMAIL=tu@email.com npm run test:keys-email')
  process.exit(1)
}

async function testKeysEmail() {
  logger.info('🧪 Probando email con claves adjuntas\n')

  // Datos de prueba
  const orderId = '12345'
  const reference = `ORDER-${orderId}`
  
  // Simular claves asignadas
  const mockKeys = [
    { productId: '101', productName: 'Microsoft Office 365', keys: ['XXXXX-XXXXX-XXXXX-XXXXX-XXXXX', 'YYYYY-YYYYY-YYYYY-YYYYY-YYYYY'] },
    { productId: '102', productName: 'Windows 11 Pro', keys: ['AAAAA-BBBBB-CCCCC-DDDDD-EEEEE'] },
  ]

  const assignedSummary = {
    '101': 2,
    '102': 1
  }

  // Generar archivo de claves
  let keysFileContent = `╔════════════════════════════════════════════════════════════════╗
║                  CLAVES DE LICENCIA - MERCADOR                 ║
║                                                                ║
║  Orden: ${reference.padEnd(52)} ║
║  Fecha: ${new Date().toLocaleDateString('es-CO').padEnd(52)} ║
╚════════════════════════════════════════════════════════════════╝

`
  mockKeys.forEach((product) => {
    keysFileContent += `\n${'='.repeat(64)}\n`
    keysFileContent += `PRODUCTO: ${product.productName}\n`
    keysFileContent += `ID: ${product.productId}\n`
    keysFileContent += `CANTIDAD: ${product.keys.length} clave(s)\n`
    keysFileContent += `${'='.repeat(64)}\n\n`
    
    product.keys.forEach((key, keyIdx) => {
      keysFileContent += `  ${keyIdx + 1}. ${key}\n`
    })
    keysFileContent += '\n'
  })
  
  keysFileContent += `\n${'='.repeat(64)}\n`
  keysFileContent += `IMPORTANTE:\n`
  keysFileContent += `- Guarda este archivo en un lugar seguro\n`
  keysFileContent += `- No compartas tus claves con nadie\n`
  keysFileContent += `- Cada clave es única y solo puede usarse una vez\n`
  keysFileContent += `- También puedes ver tus claves en tu perfil de Mercador\n`
  keysFileContent += `${'='.repeat(64)}\n`

  logger.info('📄 Contenido del archivo de claves:')
  logger.debug({ keysFileContent })
  logger.info('\n📧 Enviando email...\n')

  try {
    // URL para el template de email (notificación simple)
    const frontendTemplateUrl = `${FRONTEND_URL || 'http://localhost:3000'}/email/order-status`
    
    // Preparar datos para la factura (estos mismos datos se usarán para generar el PDF)
    const invoiceItems = mockKeys.map(k => ({
      product_id: parseInt(k.productId),
      name: k.productName,
      quantity: k.keys.length,
      price: 50000
    }))
    
    const subtotal = invoiceItems.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    const total = subtotal
    
    await sendOrderEmail({
      to: TEST_EMAIL!,
      subject: `✅ Orden ${reference} - Pago Confirmado - TEST`,
      templatePath: frontendTemplateUrl,
      templateQuery: {
        reference,
        status: 'confirmed',
        keysCount: mockKeys.reduce((sum, k) => sum + k.keys.length, 0).toString(),
        orderId,
        customerName: 'Juan Pérez',
        // Los siguientes parámetros se usarán para generar el PDF de la factura
        items: JSON.stringify(invoiceItems),
        subtotal: subtotal.toString(),
        tax: '0',
        total: total.toString(),
        paymentMethod: 'Wompi - TEST',
        transactionId: 'TRX-TEST-123',
        customerEmail: TEST_EMAIL!
      },
      attachPdf: true, // Cambia a false si NO quieres el PDF de factura
      pdfFilename: `factura-${orderId}.pdf`,
      attachments: [
        {
          data: Buffer.from(keysFileContent, 'utf-8'),
          filename: `claves-orden-${orderId}.txt`,
          contentType: 'text/plain; charset=utf-8'
        }
      ]
    })

  logger.info('✅ Email enviado exitosamente!')
  logger.info('\n📝 Próximos pasos:')
  logger.info({ TEST_EMAIL }, 'Revisa tu bandeja de entrada')
  logger.info({ filename: `claves-orden-${orderId}.txt` }, 'Busca el archivo adjunto')
  logger.info('Verifica que el email muestre el mensaje de claves adjuntas')
  logger.info('Revisa spam/promociones si no lo ves en 1-2 minutos')
    
  } catch (error) {
    logger.error({ err: error }, '❌ Error enviando email')
    process.exit(1)
  }
}

testKeysEmail().catch((err) => logger.error({ err }, 'testKeysEmail unexpected error'))
