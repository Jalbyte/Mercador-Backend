/**
 * Script para verificar la conexión con TestRail
 * 
 * Ejecutar: npx tsx src/__tests__/helpers/examples/verify-testrail.ts
 */

import { config } from 'dotenv';
import { TestRailReporter } from '../testrail-reporter.js';

// Cargar variables de entorno desde .env
config();

async function verifyConnection() {
  console.log('🔍 Verificando conexión con TestRail...\n');

  const reporter = new TestRailReporter();

  // Verificar configuración
  if (!reporter.isConfigured()) {
    console.error('❌ TestRail no está configurado correctamente.');
    console.log('\nAsegúrate de tener en tu .env:');
    console.log('  - TESTRAIL_HOST');
    console.log('  - TESTRAIL_USER');
    console.log('  - TESTRAIL_API_KEY');
    console.log('  - TESTRAIL_PROJECT_ID');
    console.log('  - TESTRAIL_SUITE_ID\n');
    process.exit(1);
  }

  console.log('✅ Configuración encontrada:');
  console.log(`  Host: ${process.env.TESTRAIL_HOST}`);
  console.log(`  User: ${process.env.TESTRAIL_USER}`);
  console.log(`  Project ID: ${process.env.TESTRAIL_PROJECT_ID}`);
  console.log(`  Suite ID: ${process.env.TESTRAIL_SUITE_ID}\n`);

  // Intentar crear un test run de prueba
  console.log('📝 Intentando crear Test Run de prueba...');
  
  try {
    const runId = await reporter.createTestRun(
      'Test de Conexión - ' + new Date().toISOString(),
      'Test run creado automáticamente para verificar la conexión'
    );

    if (runId > 0) {
      console.log('✅ ¡Conexión exitosa! Test Run creado con ID:', runId);
      
      // Cerrar el test run de prueba
      console.log('\n🧹 Cerrando Test Run de prueba...');
      await reporter.closeTestRun(runId);
      console.log('✅ Test Run cerrado correctamente\n');
      
      console.log('🎉 ¡Tu configuración de TestRail está lista!');
      console.log('💡 Ahora puedes ejecutar tus tests y reportar a TestRail.\n');
    } else {
      console.error('❌ No se pudo crear el Test Run. Verifica tus credenciales.\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error al conectar con TestRail:', error);
    console.log('\n💡 Posibles causas:');
    console.log('  1. API Key incorrecta');
    console.log('  2. Project ID o Suite ID incorrectos');
    console.log('  3. Usuario sin permisos para crear Test Runs');
    console.log('  4. URL de TestRail incorrecta\n');
    process.exit(1);
  }
}

// Ejecutar verificación
verifyConnection();
