/**
 * Script para ejecutar tests y reportar a TestRail
 * 
 * Este script:
 * 1. Crea un Test Run en TestRail
 * 2. Ejecuta los tests de autenticación, productos y carrito
 * 3. Reporta los resultados a TestRail
 * 4. Cierra el Test Run
 * 
 * Tests incluidos:
 * - Autenticación: C38, C41, C42, C44, C58, C62 (30 tests)
 * - Productos: C75, C80, C81 (21 tests)
 * - Carrito: C113, C114, C116, C117, C129, C137 (60 tests)
 * Total: 111 tests
 * 
 * Ejecutar: npx tsx src/__tests__/helpers/examples/run-and-report.ts
 */

import { config } from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';
import { TestRailReporter, extractCaseId, formatElapsedTime } from '../testrail-reporter.js';

const execAsync = promisify(exec);

// Cargar variables de entorno
config();

async function runTestsAndReport() {
  console.log('🚀 Iniciando ejecución de tests con reporte a TestRail...\n');

  const reporter = new TestRailReporter();

  if (!reporter.isConfigured()) {
    console.error('❌ TestRail no está configurado correctamente.');
    process.exit(1);
  }

  let runId = 0;

  try {
    // 1. Crear Test Run en TestRail
    console.log('📝 Creando Test Run en TestRail...');
    runId = await reporter.createTestRun(
      `Automated Test Run - ${new Date().toLocaleString('es-CO')}`,
      'Tests automatizados de autenticación, productos y carrito de compras',
      [38, 41, 42, 44, 58, 62, 75, 80, 81, 113, 114, 116, 117, 129, 137]
    );

    if (runId === 0) {
      console.error('❌ No se pudo crear el Test Run. Abortando...');
      process.exit(1);
    }

    console.log(`✅ Test Run creado: ID ${runId}\n`);

    // 2. Ejecutar los tests
    console.log('🧪 Ejecutando tests de autenticación, productos y carrito...');
    const startTime = Date.now();
    
    let stdout = '';
    let stderr = '';
    let testExitCode = 0;

    try {
      // Ejecutar tests específicos (evita glob que puede fallar)
      const result = await execAsync(
        'npx vitest run src/__tests__/auth/register.test.ts src/__tests__/auth/login.test.ts src/__tests__/auth/login-mfa.test.ts src/__tests__/auth/token-validation.test.ts src/__tests__/auth/login-failed.test.ts src/__tests__/auth/logout.test.ts src/__tests__/products/create-product.test.ts src/__tests__/products/create-product-invalid-price.test.ts src/__tests__/products/create-product-invalid-stock.test.ts src/__tests__/cart/update-quantity.test.ts src/__tests__/cart/add-to-cart.test.ts src/__tests__/cart/validate-quantity-equal-stock.test.ts src/__tests__/cart/validate-total-price.test.ts src/__tests__/cart/admin-update-product-cart.test.ts src/__tests__/cart/validate-total-price-multiple.test.ts --reporter=json',
        { maxBuffer: 20 * 1024 * 1024 }
      );
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (execError: any) {
      // exec falla con código != 0, pero puede haber stdout con resultados
      stdout = execError.stdout || '';
      stderr = execError.stderr || '';
      testExitCode = execError.code || 1;
      console.warn(`⚠️ Vitest terminó con código ${testExitCode}, pero intentaremos parsear resultados...`);
    }

    const duration = Date.now() - startTime;
    const elapsed = `${Math.round(duration / 1000)}s`;

    // Parsear resultados JSON de Vitest
    let testResults: any = null;
    try {
      // Dividir stdout en líneas y buscar la que contenga el JSON de Vitest
      const lines = stdout.split('\n');
      let jsonLine = '';
      
      // Buscar la línea que contiene el JSON de Vitest (empieza con { y tiene "testResults")
      for (const line of lines) {
        if (line.trim().startsWith('{') && line.includes('"testResults"')) {
          jsonLine = line.trim();
          break;
        }
      }
      
      if (jsonLine) {
        testResults = JSON.parse(jsonLine);
        console.log(`✅ JSON parseado: ${testResults.numTotalTests} tests totales, ${testResults.numPassedTests} pasaron`);
      } else {
        // Fallback: buscar el JSON completo en todo el stdout
        const jsonMatch = stdout.match(/\{[\s\S]*?"testResults"[\s\S]*?\}\s*$/);
        if (jsonMatch) {
          testResults = JSON.parse(jsonMatch[0]);
          console.log('✅ JSON extraído con regex avanzada');
        } else {
          throw new Error('No se encontró JSON de Vitest en stdout');
        }
      }
    } catch (e) {
      console.error('⚠️ No se pudo parsear la salida JSON de Vitest');
      if (stdout) {
        const lines = stdout.split('\n');
        console.log(`Líneas de stdout: ${lines.length}`);
        console.log('Primeras líneas:', lines.slice(0, 3).join('\n'));
        console.log('Últimas líneas:', lines.slice(-3).join('\n'));
      }
      if (stderr) console.error('stderr:', stderr.substring(0, 200));
    }

    console.log('\n📊 Reportando resultados a TestRail...\n');

    if (!testResults || !Array.isArray(testResults.testResults) || testResults.testResults.length === 0) {
      console.warn('⚠️ No se encontraron resultados detallados. Reportando error genérico.');
      await reporter.addResult(runId, 38, {
        case_id: 38,
        status_id: 5,
        comment: `Error al ejecutar tests o parsear resultados.\nExit code: ${testExitCode}\nDuración: ${elapsed}`,
        elapsed: elapsed,
        version: '1.0.0'
      });
    } else {
      // Agrupar resultados por Case ID para evitar sobrescrituras
      const resultsByCase = new Map<number, { passed: number; failed: number; skipped: number; tests: string[]; durations: number[] }>();

      for (const file of testResults.testResults) {
        const assertionResults = file.assertionResults || [];
        for (const t of assertionResults) {
          const fullName = t.fullName || t.title || '';
          const caseId = extractCaseId(fullName);
          if (!caseId) continue;

          if (!resultsByCase.has(caseId)) {
            resultsByCase.set(caseId, { passed: 0, failed: 0, skipped: 0, tests: [], durations: [] });
          }
          const caseData = resultsByCase.get(caseId)!;

          if (t.status === 'passed') caseData.passed++;
          else if (t.status === 'failed') caseData.failed++;
          else caseData.skipped++;

          caseData.tests.push(`${t.status.toUpperCase()}: ${fullName}`);
          if (typeof t.duration === 'number') caseData.durations.push(t.duration);
        }
      }

      // Reportar cada Case agregado
      for (const [caseId, data] of resultsByCase.entries()) {
        // Si algún test falló, marcar Case como Failed; si todos pasaron -> Passed
        const statusId = data.failed > 0 ? 5 : (data.passed > 0 ? 1 : 3);
        const avgDuration = data.durations.length > 0 
          ? formatElapsedTime(data.durations.reduce((a, b) => a + b, 0) / data.durations.length)
          : elapsed;

        const comment = [
          `Tests ejecutados: ${data.passed + data.failed + data.skipped}`,
          `✅ Pasaron: ${data.passed}`,
          `❌ Fallaron: ${data.failed}`,
          `⏭️ Saltados: ${data.skipped}`,
          '',
          'Detalle:',
          ...data.tests.map(t => `  - ${t}`)
        ].join('\n');

        await reporter.addResult(runId, caseId, {
          case_id: caseId,
          status_id: statusId,
          comment: comment,
          elapsed: avgDuration,
          version: '1.0.0'
        });

        console.log(`   ${statusId === 1 ? '✅' : (statusId === 5 ? '❌' : '⏭️')} C${caseId} - ${data.passed}/${data.passed + data.failed} tests pasaron`);
      }
    }

    // 4. Cerrar Test Run
    console.log('\n🔒 Cerrando Test Run...');
    await reporter.closeTestRun(runId);

    console.log('\n🎉 ¡Proceso completado exitosamente!');
    console.log(`\n📊 Ver resultados en TestRail:`);
    console.log(`   https://mercadorapp.testrail.io/index.php?/runs/view/${runId}\n`);

  } catch (error) {
    console.error('\n❌ Error durante el proceso:', error);
    
    if (runId > 0) {
      console.log('🔒 Cerrando Test Run...');
      await reporter.closeTestRun(runId);
    }
    
    process.exit(1);
  }
}

runTestsAndReport();
