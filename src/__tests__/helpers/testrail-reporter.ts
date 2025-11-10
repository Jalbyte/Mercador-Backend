/**
 * TestRail Reporter Helper
 * 
 * Este helper permite reportar resultados de tests a TestRail
 * usando la API REST de TestRail.
 * 
 * Configuración requerida en .env:
 * - TESTRAIL_HOST=https://your-instance.testrail.io
 * - TESTRAIL_USER=tu-email@example.com
 * - TESTRAIL_API_KEY=tu-api-key
 * - TESTRAIL_PROJECT_ID=1
 * - TESTRAIL_SUITE_ID=1
 */

interface TestRailConfig {
  host: string;
  user: string;
  apiKey: string;
  projectId: number;
  suiteId: number;
}

interface TestResult {
  case_id: number;
  status_id: number; // 1=Passed, 2=Blocked, 3=Untested, 4=Retest, 5=Failed
  comment?: string;
  elapsed?: string; // Time in format "30s" or "1m 45s"
  defects?: string;
  version?: string;
}

/**
 * Cliente para interactuar con TestRail API
 */
export class TestRailReporter {
  private config: TestRailConfig;
  private baseUrl: string;
  private authHeader: string;

  constructor(config?: Partial<TestRailConfig>) {
    this.config = {
      host: config?.host || process.env.TESTRAIL_HOST || '',
      user: config?.user || process.env.TESTRAIL_USER || '',
      apiKey: config?.apiKey || process.env.TESTRAIL_API_KEY || '',
      projectId: config?.projectId || parseInt(process.env.TESTRAIL_PROJECT_ID || '1'),
      suiteId: config?.suiteId || parseInt(process.env.TESTRAIL_SUITE_ID || '1'),
    };

    this.baseUrl = `${this.config.host}/index.php?/api/v2`;
    this.authHeader = 'Basic ' + Buffer.from(`${this.config.user}:${this.config.apiKey}`).toString('base64');
  }

  /**
   * Verifica si TestRail está configurado
   */
  isConfigured(): boolean {
    return !!(this.config.host && this.config.user && this.config.apiKey);
  }

  /**
   * Crea un nuevo Test Run en TestRail
   */
  async createTestRun(name: string, description?: string, caseIds?: number[]): Promise<number> {
    if (!this.isConfigured()) {
      console.warn('⚠️  TestRail no está configurado. Saltando creación de test run.');
      return 0;
    }

    const payload: any = {
      suite_id: this.config.suiteId,
      name: name,
      description: description || `Automated test run - ${new Date().toISOString()}`,
      include_all: !caseIds || caseIds.length === 0,
    };

    if (caseIds && caseIds.length > 0) {
      payload.case_ids = caseIds;
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/add_run/${this.config.projectId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': this.authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        throw new Error(`TestRail API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`✅ Test Run creado en TestRail: ID ${data.id}`);
      return data.id;
    } catch (error) {
      console.error('❌ Error creando Test Run en TestRail:', error);
      return 0;
    }
  }

  /**
   * Agrega un resultado para un caso de prueba específico
   */
  async addResult(runId: number, caseId: number, result: TestResult): Promise<void> {
    if (!this.isConfigured() || runId === 0) {
      return;
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/add_result_for_case/${runId}/${caseId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': this.authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(result),
        }
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`TestRail API error: ${response.status} ${response.statusText}\nResponse: ${errorBody}`);
      }

      const statusName = result.status_id === 1 ? '✅ PASSED' : '❌ FAILED';
      console.log(`  ${statusName} - Case C${caseId}`);
    } catch (error) {
      console.error(`❌ Error reportando resultado para Case C${caseId}:`, error);
    }
  }

  /**
   * Agrega múltiples resultados de una vez
   */
  async addResults(runId: number, results: TestResult[]): Promise<void> {
    if (!this.isConfigured() || runId === 0) {
      return;
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/add_results_for_cases/${runId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': this.authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ results }),
        }
      );

      if (!response.ok) {
        throw new Error(`TestRail API error: ${response.status} ${response.statusText}`);
      }

      console.log(`✅ ${results.length} resultados reportados a TestRail`);
    } catch (error) {
      console.error('❌ Error reportando resultados a TestRail:', error);
    }
  }

  /**
   * Cierra un Test Run
   */
  async closeTestRun(runId: number): Promise<void> {
    if (!this.isConfigured() || runId === 0) {
      return;
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/close_run/${runId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': this.authHeader,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`TestRail API error: ${response.status} ${response.statusText}`);
      }

      console.log(`✅ Test Run ${runId} cerrado en TestRail`);
    } catch (error) {
      console.error('❌ Error cerrando Test Run:', error);
    }
  }
}

/**
 * Helper para reportar resultados de Vitest a TestRail
 */
export function createTestRailReporter() {
  const reporter = new TestRailReporter();

  if (!reporter.isConfigured()) {
    console.log('ℹ️  TestRail no está configurado. Los tests se ejecutarán sin reportar a TestRail.');
    return null;
  }

  return reporter;
}

/**
 * Extrae el ID del caso de TestRail del nombre del test
 * Ejemplo: "C38-1: Debe registrar usuario" -> 38
 */
export function extractCaseId(testName: string): number | null {
  const match = testName.match(/C(\d+)/);
  return match ? parseInt(match[1]) : null;
}

/**
 * Formatea el tiempo de ejecución para TestRail
 * TestRail acepta formatos: "30s", "1m 45s", "2h 30m" (sin decimales, sólo enteros)
 * Ejemplo: 1234 ms -> "1s"
 */
export function formatElapsedTime(ms: number): string {
  // TestRail rechaza "ms" y decimales; convertir a segundos mínimo
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  
  if (totalSeconds < 60) return `${totalSeconds}s`;
  
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}
