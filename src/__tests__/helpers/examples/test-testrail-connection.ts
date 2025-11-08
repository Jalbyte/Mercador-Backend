/**
 * Script para obtener información del proyecto y verificar permisos
 * 
 * Ejecutar: npx tsx src/__tests__/helpers/examples/test-testrail-connection.ts
 */

import { config } from 'dotenv';

// Cargar variables de entorno desde .env
config();

async function testConnection() {
  const host = process.env.TESTRAIL_HOST;
  const user = process.env.TESTRAIL_USER;
  const apiKey = process.env.TESTRAIL_API_KEY;
  const projectId = process.env.TESTRAIL_PROJECT_ID;

  console.log('🔍 Probando conexión con TestRail API...\n');
  console.log(`Host: ${host}`);
  console.log(`User: ${user}`);
  console.log(`Project ID: ${projectId}\n`);

  const authHeader = 'Basic ' + Buffer.from(`${user}:${apiKey}`).toString('base64');

  try {
    // Test 1: Obtener información del proyecto
    console.log('📋 Test 1: Obtener información del proyecto...');
    const projectResponse = await fetch(
      `${host}/index.php?/api/v2/get_project/${projectId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      }
    );

    if (projectResponse.ok) {
      const project = await projectResponse.json();
      console.log(`✅ Proyecto encontrado: "${project.name}"`);
      console.log(`   Suite Mode: ${project.suite_mode === 1 ? 'Single Suite' : project.suite_mode === 2 ? 'Single Suite + Baselines' : 'Multiple Suites'}\n`);
    } else {
      console.log(`❌ Error: ${projectResponse.status} ${projectResponse.statusText}\n`);
    }

    // Test 2: Listar suites
    console.log('📋 Test 2: Listar suites del proyecto...');
    const suitesResponse = await fetch(
      `${host}/index.php?/api/v2/get_suites/${projectId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      }
    );

    if (suitesResponse.ok) {
      const suites = await suitesResponse.json();
      if (Array.isArray(suites) && suites.length > 0) {
        console.log(`✅ Suites encontrados (${suites.length}):`);
        suites.forEach((suite: any) => {
          console.log(`   - Suite ID: ${suite.id} | Nombre: "${suite.name}"`);
        });
        console.log('\n💡 Usa uno de estos IDs como TESTRAIL_SUITE_ID en tu .env\n');
      } else {
        console.log('⚠️  No se encontraron suites en este proyecto\n');
      }
    } else {
      console.log(`❌ Error: ${suitesResponse.status} ${suitesResponse.statusText}\n`);
    }

    // Test 3: Obtener información del caso C38
    console.log('📋 Test 3: Obtener información del caso C38...');
    const caseResponse = await fetch(
      `${host}/index.php?/api/v2/get_case/38`,
      {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      }
    );

    if (caseResponse.ok) {
      const testCase = await caseResponse.json();
      console.log(`✅ Caso encontrado:`);
      console.log(`   ID: C${testCase.id}`);
      console.log(`   Título: "${testCase.title}"`);
      console.log(`   Suite ID: ${testCase.suite_id}`);
      console.log(`   Section ID: ${testCase.section_id}`);
      console.log(`   Prioridad: ${testCase.priority_id}`);
      console.log(`   Tipo: ${testCase.type_id}\n`);
      console.log(`💡 El SUITE_ID correcto para C38 es: ${testCase.suite_id}\n`);
    } else {
      console.log(`❌ Error: ${caseResponse.status} ${caseResponse.statusText}\n`);
    }

    // Test 4: Listar runs activos
    console.log('📋 Test 4: Listar Test Runs activos...');
    const runsResponse = await fetch(
      `${host}/index.php?/api/v2/get_runs/${projectId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      }
    );

    if (runsResponse.ok) {
      const runs = await runsResponse.json();
      if (Array.isArray(runs) && runs.length > 0) {
        console.log(`✅ Test Runs encontrados (${runs.length}):`);
        runs.forEach((run: any) => {
          console.log(`   - Run ID: ${run.id} | Nombre: "${run.name}" | ${run.is_completed ? '🔒 Cerrado' : '✅ Activo'}`);
        });
        console.log('\n💡 Puedes reportar resultados a cualquier Run activo\n');
      } else {
        console.log('⚠️  No hay Test Runs activos en este proyecto\n');
      }
    } else {
      console.log(`❌ Error: ${runsResponse.status} ${runsResponse.statusText}\n`);
    }

    console.log('✅ Diagnóstico completo!');

  } catch (error) {
    console.error('❌ Error de conexión:', error);
  }
}

testConnection();
