# Scripts de TestRail para Mercador Backend

Este directorio contiene scripts para integrar los tests automatizados con TestRail.

## 📋 Scripts disponibles

### 1. `verify-testrail.ts` - Verificar conexión
Verifica que las credenciales de TestRail estén configuradas correctamente.

```bash
npx tsx src/__tests__/helpers/examples/verify-testrail.ts
```

**Qué hace:**
- Valida las variables de entorno de TestRail
- Intenta crear y cerrar un Test Run de prueba
- Confirma que tienes permisos necesarios

---

### 2. `test-testrail-connection.ts` - Diagnóstico completo
Obtiene información detallada del proyecto y casos de prueba.

```bash
npx tsx src/__tests__/helpers/examples/test-testrail-connection.ts
```

**Qué hace:**
- Muestra información del proyecto
- Lista todos los suites disponibles
- Obtiene detalles de casos específicos (C38, C41, etc.)
- Lista Test Runs activos

---

### 3. `run-and-report.ts` - Ejecutar tests y reportar
**⭐ Script principal**: ejecuta tests y reporta resultados automáticamente a TestRail.

```bash
npx tsx src/__tests__/helpers/examples/run-and-report.ts
```

**Qué hace:**
1. Crea un Test Run en TestRail con los casos C38 y C41
2. Ejecuta los tests de autenticación (`register.test.ts` y `login.test.ts`)
3. Parsea los resultados de Vitest (JSON)
4. Agrupa resultados por Case ID (evita sobrescrituras)
5. Reporta cada caso a TestRail con estado (Passed/Failed) y comentarios
6. Cierra el Test Run
7. Muestra URL del run en TestRail

**Salida esperada:**
```
🚀 Iniciando ejecución de tests con reporte a TestRail...

📝 Creando Test Run en TestRail...
✅ Test Run creado: ID 22

🧪 Ejecutando tests de autenticación...
✅ JSON parseado: 9 tests totales, 5 pasaron

📊 Reportando resultados a TestRail...

  ✅ PASSED - Case C41
   ✅ C41 - 2/2 tests pasaron
  ✅ PASSED - Case C38
   ✅ C38 - 3/3 tests pasaron

🔒 Cerrando Test Run...
✅ Test Run 22 cerrado en TestRail

📊 Ver resultados en TestRail:
   https://mercadorapp.testrail.io/index.php?/runs/view/22
```

---

### 4. `testrail-example.ts` - Ejemplo de uso del reporter
Script de ejemplo que muestra cómo usar el `TestRailReporter` programáticamente.

```bash
npx tsx src/__tests__/helpers/examples/testrail-example.ts
```

---

## ⚙️ Configuración requerida

Las siguientes variables deben estar en tu archivo `.env`:

```properties
TESTRAIL_HOST=https://mercadorapp.testrail.io
TESTRAIL_USER=tu-email@example.com
TESTRAIL_API_KEY=tu-api-key-aqui
TESTRAIL_PROJECT_ID=2
TESTRAIL_SUITE_ID=6
```

### Cómo obtener tu API Key:
1. Inicia sesión en TestRail
2. Ve a **My Settings** (arriba a la derecha, tu perfil)
3. Pestaña **API Keys**
4. Genera una nueva API Key
5. Copia y pégala en `.env`

---

## 📝 Cómo mapear tests a TestRail

Para que un test se reporte automáticamente a TestRail, **debe incluir `C<número>` en su nombre**:

### ✅ Ejemplo correcto:

```typescript
describe('C41: Inicio de sesión exitoso con credenciales válidas', () => {
  it('C41-1: Debe iniciar sesión y devolver una sesión válida', async () => {
    // Tu test aquí
  })

  it('C41-2: Ruta POST /auth/login debe responder 200', async () => {
    // Tu test aquí
  })
})
```

**Resultado:** Ambos tests se mapean al Case **C41** en TestRail. Si ambos pasan, C41 se marca como **Passed**.

---

## 🎯 Cómo funcionan los reportes

### Agregación por Case ID
Si varios tests se mapean al mismo Case (por ejemplo, `C41-1` y `C41-2`), el script:
- **Agrupa** todos los tests de ese Case
- Si **alguno falla** → Case marcado como **Failed** ❌
- Si **todos pasan** → Case marcado como **Passed** ✅
- Si **todos se saltan** → Case marcado como **Skipped** ⏭️

### Comentarios detallados
Cada resultado incluye:
- Número total de tests ejecutados para ese Case
- Cuántos pasaron/fallaron/se saltaron
- Lista detallada de cada test con su estado
- Tiempo promedio de ejecución

**Ejemplo de comentario en TestRail:**
```
Tests ejecutados: 2
✅ Pasaron: 2
❌ Fallaron: 0
⏭️ Saltados: 0

Detalle:
  - PASSED: C41: Inicio de sesión exitoso... C41-1: Debe iniciar sesión...
  - PASSED: C41: Inicio de sesión exitoso... C41-2: Ruta POST /auth/login...
```

---

## 🚀 Integración en CI/CD

### GitHub Actions ejemplo:

```yaml
- name: Run tests and report to TestRail
  env:
    TESTRAIL_HOST: ${{ secrets.TESTRAIL_HOST }}
    TESTRAIL_USER: ${{ secrets.TESTRAIL_USER }}
    TESTRAIL_API_KEY: ${{ secrets.TESTRAIL_API_KEY }}
    TESTRAIL_PROJECT_ID: ${{ secrets.TESTRAIL_PROJECT_ID }}
    TESTRAIL_SUITE_ID: ${{ secrets.TESTRAIL_SUITE_ID }}
  run: npx tsx src/__tests__/helpers/examples/run-and-report.ts
```

---

## 🐛 Troubleshooting

### Error: "Field :elapsed is not in a valid time span format"
**Solucionado** ✅ - El script ahora formatea tiempos correctamente (sólo segundos enteros, sin decimales).

### Error: "Command failed: npx vitest run src/__tests__/auth/*.test.ts"
**Solucionado** ✅ - El script ahora usa rutas específicas en lugar de globs.

### Error: "TestRail API error: 401 Unauthorized"
- Verifica que tu `TESTRAIL_API_KEY` sea correcta
- Revisa que el usuario tenga permisos en el proyecto

### Error: "TestRail API error: 400 Bad Request"
- Verifica que `TESTRAIL_PROJECT_ID` y `TESTRAIL_SUITE_ID` sean correctos
- Ejecuta `test-testrail-connection.ts` para validar la configuración

### No se reportan algunos tests
- Asegúrate de que el nombre del test incluya `C<número>` (ej: `C41`, `C38`)
- Verifica que el Case ID exista en TestRail

---

## 📚 Recursos adicionales

- [TestRail API Documentation](https://www.gurock.com/testrail/docs/api)
- [Vitest JSON Reporter](https://vitest.dev/guide/reporters.html)
- Helper principal: `src/__tests__/helpers/testrail-reporter.ts`

---

## ✅ Casos de prueba actuales

| Case ID | Título | Tests mapeados | Archivo |
|---------|--------|----------------|---------|
| C38 | CP-001: Registro de nuevo usuario | 3 tests unitarios | `register.test.ts` |
| C41 | Inicio de sesión exitoso con credenciales válidas | 2 tests (unit + integration) | `login.test.ts` |
| C42 | Inicio de sesión exitoso con 2FA habilitado | 4 tests (flujo MFA completo) | `login-mfa.test.ts` |

### Cobertura de C42 (MFA):
- ✅ Login inicial con 2FA habilitado devuelve `mfaRequired=true`
- ✅ Verificación de código OTP válido completa el login
- ✅ Sesión se mueve de `mfa_pending` a `session` en Redis
- ✅ Código OTP incorrecto falla apropiadamente

---

**Última actualización:** Noviembre 8, 2025
