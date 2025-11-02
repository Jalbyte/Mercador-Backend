/**
 * Script de diagnóstico para Mailgun
 * 
 * Verifica configuración y envía un email de prueba
 * 
 * Uso:
 *   TEST_EMAIL=tu@email.com npm run debug:mailgun
 */

import FormData from 'form-data'
import { MAILGUN_API_KEY, MAILGUN_DOMAIN } from '../config/env.js'

const TEST_EMAIL = process.env.TEST_EMAIL

if (!TEST_EMAIL) {
  console.error('❌ Error: Debes proporcionar TEST_EMAIL')
  console.log('Uso: TEST_EMAIL=tu@email.com npm run debug:mailgun')
  process.exit(1)
}

async function debugMailgun() {
  console.log('🔍 Diagnóstico de Mailgun\n')

  // 1. Verificar configuración
  console.log('📋 Configuración:')
  console.log('  MAILGUN_API_KEY:', MAILGUN_API_KEY ? `✅ Configurado (${MAILGUN_API_KEY.substring(0, 10)}...)` : '❌ No configurado')
  console.log('  MAILGUN_DOMAIN:', MAILGUN_DOMAIN || '❌ No configurado')
  console.log('  TEST_EMAIL:', TEST_EMAIL)
  console.log()

  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
    console.error('❌ Configuración incompleta. Verifica tu .env')
    process.exit(1)
  }

  // 2. Verificar dominio
  console.log('🌐 Verificando dominio...')
  try {
    const Mailgun: any = (await import('mailgun.js')).default
    const mailgun = new Mailgun(FormData)
    const mg = mailgun.client({ username: 'api', key: MAILGUN_API_KEY })

    // Obtener info del dominio
    const domain = await mg.domains.get(MAILGUN_DOMAIN)
    console.log('  ✅ Dominio encontrado:', domain.name)
    console.log('  📊 Estado:', domain.state)
    console.log('  🔐 DKIM:', domain.dkim_authority ? '✅ Verificado' : '❌ No verificado')
    console.log('  📧 SPF:', domain.spf ? '✅ Verificado' : '❌ No verificado')
    console.log()

    if (domain.state !== 'active') {
      console.warn('⚠️  El dominio no está activo. Verifica la configuración DNS.')
      console.log('   Visita: https://app.mailgun.com/app/sending/domains/' + MAILGUN_DOMAIN + '/verify')
      console.log()
    }

    // 3. Enviar email de prueba
    console.log('📧 Enviando email de prueba...')
    const message = {
      from: `Mercador Test <noreply@${MAILGUN_DOMAIN}>`,
      to: [TEST_EMAIL],
      subject: '🧪 Test Email - Mailgun Debug',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
          </head>
          <body style="font-family: Arial, sans-serif; padding: 20px;">
            <h1 style="color: #4f46e5;">✅ Mailgun está funcionando!</h1>
            <p>Este es un email de prueba enviado desde tu backend.</p>
            <hr>
            <p style="color: #6b7280; font-size: 14px;">
              <strong>Configuración:</strong><br>
              Domain: ${MAILGUN_DOMAIN}<br>
              Time: ${new Date().toISOString()}
            </p>
          </body>
        </html>
      `,
      text: 'Este es un email de prueba. Si lo recibes, Mailgun está funcionando correctamente.'
    }

    const result = await mg.messages.create(MAILGUN_DOMAIN, message)
    
    console.log('  ✅ Email enviado exitosamente!')
    console.log('  🆔 Message ID:', result.id)
    console.log('  📊 Status:', result.status || 'queued')
    console.log()

    // 4. Instrucciones de verificación
    console.log('✅ Diagnóstico completado!\n')
    console.log('📝 Próximos pasos:')
    console.log('  1. Revisa tu bandeja de entrada:', TEST_EMAIL)
    console.log('  2. Revisa spam/promociones si no lo ves en 1-2 minutos')
    console.log('  3. Ver logs en Mailgun:')
    console.log('     https://app.mailgun.com/app/sending/domains/' + MAILGUN_DOMAIN + '/logs')
    console.log('  4. Si usas dominio sandbox, asegúrate de que', TEST_EMAIL, 'esté en "Authorized Recipients"')
    console.log('     https://app.mailgun.com/app/sending/domains/' + MAILGUN_DOMAIN + '/recipients')
    console.log()

    // 5. Verificar últimos logs
    console.log('📜 Obteniendo últimos eventos...')
    try {
      const events = await mg.events.get(MAILGUN_DOMAIN, { limit: 5 })
      if (events && events.items && events.items.length > 0) {
        console.log('  Últimos 5 eventos:')
        events.items.forEach((event: any, i: number) => {
          console.log(`  ${i + 1}. ${event.event} - ${event.recipient} (${new Date(event.timestamp * 1000).toLocaleString()})`)
        })
      } else {
        console.log('  No hay eventos recientes')
      }
    } catch (e: any) {
      console.log('  ⚠️  No se pudieron obtener eventos:', e.message)
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message)
    if (error.status === 401) {
      console.error('  Problema: API Key inválida')
      console.error('  Verifica: https://app.mailgun.com/app/account/security/api_keys')
    } else if (error.status === 404) {
      console.error('  Problema: Dominio no encontrado')
      console.error('  Verifica que', MAILGUN_DOMAIN, 'existe en tu cuenta de Mailgun')
      console.error('  Visita: https://app.mailgun.com/app/sending/domains')
    } else {
      console.error('  Detalles:', JSON.stringify(error, null, 2))
    }
    process.exit(1)
  }
}

debugMailgun().catch(console.error)
