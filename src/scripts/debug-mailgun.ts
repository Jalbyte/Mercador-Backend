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
import { logger } from '../utils/logger.js'

const TEST_EMAIL = process.env.TEST_EMAIL

if (!TEST_EMAIL) {
  logger.error('❌ Error: Debes proporcionar TEST_EMAIL')
  logger.info('Uso: TEST_EMAIL=tu@email.com npm run debug:mailgun')
  process.exit(1)
}

async function debugMailgun() {
  logger.info('🔍 Diagnóstico de Mailgun\n')

  // 1. Verificar configuración
  logger.info('📋 Configuración:')
  logger.info({ MAILGUN_API_KEY: MAILGUN_API_KEY ? `✅ Configurado (${MAILGUN_API_KEY.substring(0, 10)}...)` : '❌ No configurado', MAILGUN_DOMAIN, TEST_EMAIL })

  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
    logger.error('❌ Configuración incompleta. Verifica tu .env')
    process.exit(1)
  }

  // 2. Verificar dominio
  logger.info('🌐 Verificando dominio...')
  try {
    const Mailgun: any = (await import('mailgun.js')).default
    const mailgun = new Mailgun(FormData)
    const mg = mailgun.client({ username: 'api', key: MAILGUN_API_KEY })

    // Obtener info del dominio
    const domain = await mg.domains.get(MAILGUN_DOMAIN)
  logger.info({ domain: domain.name, state: domain.state, dkim: domain.dkim_authority, spf: domain.spf }, 'Dominio info')

    if (domain.state !== 'active') {
  logger.warn('⚠️  El dominio no está activo. Verifica la configuración DNS.')
  logger.info('Visita: https://app.mailgun.com/app/sending/domains/' + MAILGUN_DOMAIN + '/verify')
    }

    // 3. Enviar email de prueba
  logger.info('📧 Enviando email de prueba...')
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
    
  logger.info({ id: result.id, status: result.status || 'queued' }, 'Email enviado exitosamente')

    // 4. Instrucciones de verificación
  logger.info('✅ Diagnóstico completado!')
  logger.info('📝 Próximos pasos:')
  logger.info({ TEST_EMAIL }, 'Revisa tu bandeja de entrada')
  logger.info('Revisa spam/promociones si no lo ves en 1-2 minutos')
  logger.info('Ver logs en Mailgun: https://app.mailgun.com/app/sending/domains/' + MAILGUN_DOMAIN + '/logs')
  logger.info('Si usas dominio sandbox, asegúrate de que el destinatario esté en Authorized Recipients')

    // 5. Verificar últimos logs
  logger.info('📜 Obteniendo últimos eventos...')
    try {
      const events = await mg.events.get(MAILGUN_DOMAIN, { limit: 5 })
      if (events && events.items && events.items.length > 0) {
        logger.info('Últimos 5 eventos:')
        events.items.forEach((event: any, i: number) => {
          logger.info({ event, recipient: event.recipient, time: new Date(event.timestamp * 1000).toLocaleString() }, `Evento #${i + 1}`)
        })
      } else {
    logger.info('No hay eventos recientes')
      }
    } catch (e: any) {
      logger.warn({ err: e }, 'No se pudieron obtener eventos')
    }

  } catch (error: any) {
    logger.error({ err: error }, '❌ Error')
    if (error.status === 401) {
      logger.error('Problema: API Key inválida - Verifica: https://app.mailgun.com/app/account/security/api_keys')
    } else if (error.status === 404) {
      logger.error({ domain: MAILGUN_DOMAIN }, 'Problema: Dominio no encontrado - Verifica que existe en tu cuenta de Mailgun')
    } else {
      logger.error({ errorDetails: JSON.stringify(error, null, 2) }, 'Detalles del error')
    }
    process.exit(1)
  }
}

debugMailgun().catch((err) => logger.error({ err }, 'debugMailgun unexpected error'))
