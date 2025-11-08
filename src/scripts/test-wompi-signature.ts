/**
 * Script de diagnóstico para verificar la firma de integridad de Wompi
 * 
 * Uso:
 * 1. Asegúrate de tener las variables de entorno configuradas en .env
 * 2. Ejecuta: node --loader tsx src/scripts/test-wompi-signature.ts
 */

import crypto from 'crypto'
import dotenv from 'dotenv'
import { logger } from '../utils/logger.js'

dotenv.config()

const WOMPI_EVENTS_SECRET = process.env.WOMPI_EVENTS_SECRET || ''
const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY || ''

logger.info('\n🔍 Diagnóstico de Firma de Integridad de Wompi\n')
logger.info('='.repeat(60))

// Verificar que las variables estén configuradas
logger.info('\n1. Verificando variables de entorno...\n')

if (!WOMPI_EVENTS_SECRET) {
  logger.error('❌ WOMPI_EVENTS_SECRET no está configurado')
  process.exit(1)
} else {
  logger.info(`✅ WOMPI_EVENTS_SECRET: ${WOMPI_EVENTS_SECRET.substring(0, 10)}...`)
}

if (!WOMPI_PUBLIC_KEY) {
  logger.error('❌ WOMPI_PUBLIC_KEY no está configurado')
  process.exit(1)
} else {
  logger.info(`✅ WOMPI_PUBLIC_KEY: ${WOMPI_PUBLIC_KEY}`)
}

// Verificar si es sandbox o producción
const isSandbox = WOMPI_PUBLIC_KEY.includes('test') || WOMPI_PUBLIC_KEY.includes('sandbox')
const isSecretTest = WOMPI_EVENTS_SECRET.includes('test') || WOMPI_EVENTS_SECRET.includes('sandbox')

logger.info(`\n2. Verificando coherencia de credenciales...\n`)
logger.info(`Public Key es de: ${isSandbox ? '🧪 Sandbox (test)' : '🚀 Producción'}`)
logger.info(`Events Secret es de: ${isSecretTest ? '🧪 Sandbox (test)' : '🚀 Producción'}`)

if (isSandbox !== isSecretTest) {
  logger.warn('\n⚠️  ADVERTENCIA: Parece que estás mezclando credenciales de sandbox y producción!')
  logger.warn('   Asegúrate de que todas las credenciales sean del mismo entorno.')
}

// Generar firma de prueba
logger.info(`\n3. Generando firma de prueba...\n`)

const testData = {
  reference: 'TEST-ORDER-12345',
  amountInCents: 5000000, // 50,000 COP
  currency: 'COP'
}

logger.info('Datos de prueba:')
logger.info({ reference: testData.reference, amountInCents: testData.amountInCents, currency: testData.currency })

// Concatenar según documentación de Wompi
const concatenated = `${testData.reference}${testData.amountInCents}${testData.currency}${WOMPI_EVENTS_SECRET}`

logger.info(`\nString concatenado (primeros 50 caracteres):`)
logger.debug({ snippet: concatenated.substring(0, 50) })

// Generar hash SHA256
const signature = crypto
  .createHash('sha256')
  .update(concatenated)
  .digest('hex')

logger.info(`\n✅ Firma generada exitosamente:`)
logger.info({ signature })

// Instrucciones para probar
logger.info(`\n4. Próximos pasos para verificar:\n`)
logger.info('a) Copia esta firma y úsala en el Widget de Wompi')
logger.info('b) Si el Widget la rechaza, verifica:')
logger.info('   - Que el WOMPI_EVENTS_SECRET sea el correcto en tu cuenta de Wompi')
logger.info('   - Que el Events Secret corresponda al mismo entorno que la Public Key')
logger.info('   - En Wompi Dashboard → Desarrolladores → API Keys')
logger.info('     Busca el "Integrity Secret" o "Events Secret"')

logger.info(`\nc) Datos para probar en el Widget:`)
logger.info({ reference: testData.reference, amountInCents: testData.amountInCents, currency: testData.currency, publicKey: WOMPI_PUBLIC_KEY, signature })

logger.info('\n' + '='.repeat(60))
logger.info('\n✅ Diagnóstico completado\n')
