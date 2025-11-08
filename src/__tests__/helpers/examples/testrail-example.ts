/**
 * Ejemplo de uso del TestRail Reporter
 * 
 * Este script demuestra cómo reportar resultados a TestRail
 * después de ejecutar tests.
 */

import { TestRailReporter } from '../testrail-reporter.js';

async function example() {
  // Crear instancia del reporter
  const reporter = new TestRailReporter({
    host: 'https://your-instance.testrail.io',
    user: 'tu-email@example.com',
    apiKey: 'tu-api-key',
    projectId: 1,
    suiteId: 1,
  });

  // 1. Crear un Test Run
  console.log('📝 Creando Test Run en TestRail...');
  const runId = await reporter.createTestRun(
    'Automated Test Run - Auth Module',
    'Tests automatizados del módulo de autenticación',
    [38] // Case IDs a incluir (opcional)
  );

  // 2. Reportar resultados individuales
  console.log('\n🧪 Reportando resultados...');
  
  // C38-1: Test pasó
  await reporter.addResult(runId, 38, {
    case_id: 38,
    status_id: 1, // 1 = Passed
    comment: 'Usuario registrado exitosamente con email test@example.com',
    elapsed: '5s',
    version: '1.0.0'
  });

  // O reportar múltiples resultados de una vez
  await reporter.addResults(runId, [
    {
      case_id: 38,
      status_id: 1,
      comment: 'Test C38-1: Usuario registrado correctamente',
      elapsed: '5s'
    },
    {
      case_id: 38,
      status_id: 1,
      comment: 'Test C38-2: Email duplicado rechazado correctamente',
      elapsed: '3s'
    },
    {
      case_id: 38,
      status_id: 1,
      comment: 'Test C38-3: Cuenta eliminada rechazada correctamente',
      elapsed: '1s'
    }
  ]);

  // 3. Cerrar el Test Run
  console.log('\n✅ Cerrando Test Run...');
  await reporter.closeTestRun(runId);

  console.log('\n🎉 Resultados reportados exitosamente a TestRail!');
}

// Ejecutar ejemplo
example().catch(console.error);
