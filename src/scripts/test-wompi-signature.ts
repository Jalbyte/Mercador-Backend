/**
 * Script de diagnóstico para verificar la firma de integridad de Wompi
 * 
 * Uso:
 * 1. Asegúrate de tener las variables de entorno configuradas en .env
 * 2. Ejecuta: node --loader tsx src/scripts/test-wompi-signature.ts
 */

import crypto from 'crypto'
import dotenv from 'dotenv'

dotenv.config()

const WOMPI_EVENTS_SECRET = process.env.WOMPI_EVENTS_SECRET || ''
const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY || ''

console.log('\n🔍 Diagnóstico de Firma de Integridad de Wompi\n')
console.log('=' .repeat(60))

// Verificar que las variables estén configuradas
console.log('\n1. Verificando variables de entorno...\n')

if (!WOMPI_EVENTS_SECRET) {
  console.error('❌ WOMPI_EVENTS_SECRET no está configurado')
  process.exit(1)
} else {
  console.log(`✅ WOMPI_EVENTS_SECRET: ${WOMPI_EVENTS_SECRET.substring(0, 10)}...`)
}

if (!WOMPI_PUBLIC_KEY) {
  console.error('❌ WOMPI_PUBLIC_KEY no está configurado')
  process.exit(1)
} else {
  console.log(`✅ WOMPI_PUBLIC_KEY: ${WOMPI_PUBLIC_KEY}`)
}

// Verificar si es sandbox o producción
const isSandbox = WOMPI_PUBLIC_KEY.includes('test') || WOMPI_PUBLIC_KEY.includes('sandbox')
const isSecretTest = WOMPI_EVENTS_SECRET.includes('test') || WOMPI_EVENTS_SECRET.includes('sandbox')

console.log(`\n2. Verificando coherencia de credenciales...\n`)
console.log(`Public Key es de: ${isSandbox ? '🧪 Sandbox (test)' : '🚀 Producción'}`)
console.log(`Events Secret es de: ${isSecretTest ? '🧪 Sandbox (test)' : '🚀 Producción'}`)

if (isSandbox !== isSecretTest) {
  console.warn('\n⚠️  ADVERTENCIA: Parece que estás mezclando credenciales de sandbox y producción!')
  console.warn('   Asegúrate de que todas las credenciales sean del mismo entorno.')
}

// Generar firma de prueba
console.log(`\n3. Generando firma de prueba...\n`)

const testData = {
  reference: 'TEST-ORDER-12345',
  amountInCents: 5000000, // 50,000 COP
  currency: 'COP'
}

console.log('Datos de prueba:')
console.log(`  - Referencia: ${testData.reference}`)
console.log(`  - Monto (centavos): ${testData.amountInCents}`)
console.log(`  - Moneda: ${testData.currency}`)

// Concatenar según documentación de Wompi
const concatenated = `${testData.reference}${testData.amountInCents}${testData.currency}${WOMPI_EVENTS_SECRET}`

console.log(`\nString concatenado (primeros 50 caracteres):`)
console.log(`  ${concatenated.substring(0, 50)}...`)

// Generar hash SHA256
const signature = crypto
  .createHash('sha256')
  .update(concatenated)
  .digest('hex')

console.log(`\n✅ Firma generada exitosamente:`)
console.log(`  ${signature}`)

// Instrucciones para probar
console.log(`\n4. Próximos pasos para verificar:\n`)
console.log(`a) Copia esta firma y úsala en el Widget de Wompi`)
console.log(`b) Si el Widget la rechaza, verifica:`)
console.log(`   - Que el WOMPI_EVENTS_SECRET sea el correcto en tu cuenta de Wompi`)
console.log(`   - Que el Events Secret corresponda al mismo entorno que la Public Key`)
console.log(`   - En Wompi Dashboard → Desarrolladores → API Keys`)
console.log(`     Busca el "Integrity Secret" o "Events Secret"`)

console.log(`\nc) Datos para probar en el Widget:`)
console.log(`   {`)
console.log(`     reference: "${testData.reference}",`)
console.log(`     amountInCents: ${testData.amountInCents},`)
console.log(`     currency: "${testData.currency}",`)
console.log(`     publicKey: "${WOMPI_PUBLIC_KEY}",`)
console.log(`     signature: {`)
console.log(`       integrity: "${signature}"`)
console.log(`     }`)
console.log(`   }`)

console.log('\n' + '='.repeat(60))
console.log('\n✅ Diagnóstico completado\n')
