# 🏦 Guía de Configuración: PayU Latam

Esta guía te ayudará a configurar PayU Latam como pasarela de pago en tu aplicación Mercador.

## 📋 Tabla de Contenidos

1. [Diferencias principales con Mercado Pago](#diferencias-principales)
2. [Obtener credenciales](#obtener-credenciales)
3. [Configuración de entorno](#configuración-de-entorno)
4. [Modo Sandbox vs Producción](#sandbox-vs-producción)
5. [Flujo de pago](#flujo-de-pago)
6. [Tarjetas de prueba](#tarjetas-de-prueba)
7. [Webhook y confirmación](#webhook-y-confirmación)
8. [Errores comunes](#errores-comunes)
9. [Checklist de implementación](#checklist-de-implementación)

---

## 🔄 Diferencias principales con Mercado Pago {#diferencias-principales}

### Mercado Pago
- ✅ Genera una URL de checkout (`init_point` / `sandbox_init_point`)
- ✅ El usuario es redirigido a una página de Mercado Pago para pagar
- ✅ Soporta múltiples métodos de pago (tarjetas, efectivo, transferencias)
- ✅ Maneja autenticación 3DS automáticamente

### PayU
- ⚠️ **NO genera una URL de checkout automática** en modo API
- ⚠️ El pago se procesa directamente desde tu backend
- ⚠️ Necesitas recoger los datos de la tarjeta en tu frontend
- ⚠️ Tienes dos opciones de integración:
  1. **WebCheckout** (formulario HTML de PayU) - Más simple
  2. **API Integration** (pago directo desde backend) - Implementado en este proyecto

---

## 🔑 Obtener credenciales {#obtener-credenciales}

### 1. Crear cuenta en PayU

Ve a: https://www.payulatam.com/ y crea una cuenta de comercio.

### 2. Acceder al panel de desarrollador

Una vez creada tu cuenta, accede a:
- **Panel de Comercios**: https://merchants.payulatam.com/
- Inicia sesión con tus credenciales

### 3. Obtener credenciales de sandbox (pruebas)

En el panel:

1. Ve a **Configuración** → **Configuración técnica**
2. Selecciona el modo **"Pruebas"** (sandbox)
3. Encontrarás:

```
API Key: 4Vj8eK4rloUd272L48hsrarnUA (ejemplo)
API Login: pRRXKOl8ikMmt9u (ejemplo)
Merchant ID: 508029 (ejemplo)
Account ID: 512321 (ejemplo para Colombia)
```

> **⚠️ Importante**: Cada país tiene un `Account ID` diferente. Si vendes en múltiples países, necesitarás un Account ID por país.

### 4. Credenciales de producción

Cuando estés listo para producción:
1. Completa la validación KYC (documentos legales)
2. PayU revisará y aprobará tu cuenta
3. Cambia al modo **"Producción"** en el panel
4. Copia las nuevas credenciales de producción

---

## ⚙️ Configuración de entorno {#configuración-de-entorno}

### Variables de entorno (.env)

Copia el siguiente template en tu archivo `.env`:

```bash
# PayU Latam Configuration
PAYU_API_KEY=tu_api_key_aqui
PAYU_API_LOGIN=tu_api_login_aqui
PAYU_MERCHANT_ID=tu_merchant_id_aqui
PAYU_ACCOUNT_ID=tu_account_id_aqui
PAYU_SANDBOX_URL=https://sandbox.api.payulatam.com/payments-api/4.0/service.cgi
PAYU_TEST=true
```

### Ejemplo con credenciales de sandbox (para desarrollo)

```bash
# Sandbox PayU (Colombia)
PAYU_API_KEY=4Vj8eK4rloUd272L48hsrarnUA
PAYU_API_LOGIN=pRRXKOl8ikMmt9u
PAYU_MERCHANT_ID=508029
PAYU_ACCOUNT_ID=512321
PAYU_SANDBOX_URL=https://sandbox.api.payulatam.com/payments-api/4.0/service.cgi
PAYU_TEST=true
```

---

## 🧪 Sandbox vs Producción {#sandbox-vs-producción}

### Modo Sandbox (Desarrollo)

```bash
NODE_ENV=development
PAYU_TEST=true
PAYU_SANDBOX_URL=https://sandbox.api.payulatam.com/payments-api/4.0/service.cgi
```

**Características:**
- Usa tarjetas de prueba (no se cobra dinero real)
- Usa credenciales de prueba (API Key/Login de sandbox)
- Procesa pagos instantáneamente
- Ideal para desarrollo y testing

### Modo Producción

```bash
NODE_ENV=production
PAYU_TEST=false
# No necesitas PAYU_SANDBOX_URL en producción
# El servicio usará: https://api.payulatam.com/payments-api/4.0/service.cgi
```

**Características:**
- Usa tarjetas reales (se cobra dinero real)
- Usa credenciales de producción
- Procesos de validación bancaria reales
- Requiere certificación SSL
- Requiere validación KYC completa

---

## 💳 Flujo de pago {#flujo-de-pago}

### Arquitectura actual (API Integration)

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Frontend  │─────>│   Backend   │─────>│    PayU     │
│ (Next.js)   │      │   (Hono)    │      │     API     │
└─────────────┘      └─────────────┘      └─────────────┘
      │                     │                     │
      │  1. Datos tarjeta   │                     │
      │────────────────────>│                     │
      │                     │  2. Crear transacción
      │                     │────────────────────>│
      │                     │                     │
      │                     │  3. Respuesta       │
      │                     │<────────────────────│
      │  4. redirect_url    │                     │
      │<────────────────────│                     │
      │                     │                     │
      │                     │  5. Webhook         │
      │                     │<────────────────────│
```

### Pasos del flujo

1. **Frontend**: Usuario ingresa datos de pago en tu formulario
2. **Backend**: Recibe datos y crea transacción en PayU
3. **PayU**: Procesa el pago y retorna estado (`APPROVED`, `DECLINED`, `PENDING`)
4. **Backend**: Actualiza orden según el estado
5. **Frontend**: Redirige al usuario a página de éxito/error
6. **Webhook**: PayU envía confirmación posterior (opcional)

---

## 💳 Tarjetas de prueba {#tarjetas-de-prueba}

### Colombia (COP)

#### ✅ Tarjetas APROBADAS (APRO)

| Marca       | Número           | CVV  | Fecha Exp | Nombre en Tarjeta |
|-------------|------------------|------|-----------|-------------------|
| VISA        | 4111111111111111 | 123  | 12/2030   | APRO             |
| MASTERCARD  | 5411111111111111 | 123  | 12/2030   | APRO             |
| AMEX        | 371111111111111  | 1234 | 12/2030   | APRO             |

#### ❌ Tarjetas RECHAZADAS (DECLINED)

| Marca       | Número           | CVV  | Fecha Exp | Nombre en Tarjeta |
|-------------|------------------|------|-----------|-------------------|
| VISA        | 4097440000000004 | 123  | 12/2030   | DECLINED         |
| MASTERCARD  | 5465390000000009 | 123  | 12/2030   | DECLINED         |

#### ⏳ Tarjetas PENDIENTES (PENDING)

| Marca       | Número           | CVV  | Fecha Exp | Nombre en Tarjeta |
|-------------|------------------|------|-----------|-------------------|
| VISA        | 4666666666666669 | 123  | 12/2030   | PENDING          |

### Otros países

- **Argentina (ARS)**: Usa las mismas tarjetas pero con Account ID de Argentina
- **México (MXN)**: Mismas tarjetas, Account ID de México
- **Perú (PEN)**: Mismas tarjetas, Account ID de Perú
- **Brasil (BRL)**: Requiere CPF, tarjetas específicas

> 📋 **Documentación oficial**: https://developers.payulatam.com/latam/es/docs/getting-started/test-your-solution.html

---

## 🔔 Webhook y confirmación {#webhook-y-confirmación}

### Configurar webhook en PayU

1. Ve al panel de PayU: https://merchants.payulatam.com/
2. **Configuración** → **Configuración técnica**
3. En **"URL de confirmación"**, ingresa:

```
https://tu-dominio.com/payu/webhook
```

Para desarrollo local (usando ngrok):
```
https://abc123.ngrok.io/payu/webhook
```

### Formato del webhook

PayU envía los datos como `application/x-www-form-urlencoded`:

```
merchant_id=508029
state_pol=4 (APPROVED)
reference_sale=ORDER_123
transaction_id=abc-123-def
value=50000.00
currency=COP
email_buyer=test@example.com
sign=abc123def456... (MD5 signature)
```

### Validar signature

**Importante**: Siempre valida el signature para evitar fraudes.

```typescript
const calculatedSignature = crypto
  .createHash('md5')
  .update(`${PAYU_API_KEY}~${PAYU_MERCHANT_ID}~${reference_sale}~${value}~${currency}~${state_pol}`)
  .digest('hex');

if (receivedSignature !== calculatedSignature) {
  // ⚠️ Webhook inválido - posible fraude
  return;
}
```

### Estados del webhook

| state_pol | Significado | Acción recomendada |
|-----------|-------------|-------------------|
| 4         | APPROVED    | ✅ Confirmar orden, asignar productos |
| 6         | DECLINED    | ❌ Cancelar orden, notificar usuario |
| 7         | PENDING     | ⏳ Mantener orden pendiente |
| 5         | EXPIRED     | ❌ Cancelar orden |

---

## ⚠️ Errores comunes {#errores-comunes}

### 1. Error: "Invalid signature"

**Causa**: El signature MD5 no coincide.

**Solución**:
- Verifica que uses el `PAYU_API_KEY` correcto (sandbox vs producción)
- Asegúrate de que el monto tenga exactamente 2 decimales: `50000.00`
- Verifica el orden de los campos: `ApiKey~MerchantId~ReferenceCode~Amount~Currency`

```typescript
// ✅ Correcto
const amount = "50000.00"; // 2 decimales
const signature = `${API_KEY}~${MERCHANT_ID}~${orderId}~${amount}~COP`;

// ❌ Incorrecto
const amount = "50000"; // Sin decimales
```

### 2. Error: "Invalid account"

**Causa**: Estás usando un `PAYU_ACCOUNT_ID` incorrecto para el país.

**Solución**:
- Verifica que el Account ID corresponda al país de la transacción
- Colombia: 512321 (ejemplo)
- Puedes tener múltiples Account IDs si vendes en varios países

### 3. Error: "Card not supported"

**Causa**: La tarjeta no está disponible en el país de la transacción.

**Solución**:
- Usa tarjetas de prueba específicas para tu país
- En sandbox Colombia, usa: `4111111111111111`

### 4. No se recibe el webhook

**Causa**: PayU no puede alcanzar tu servidor.

**Solución**:
- Para desarrollo local, usa **ngrok** o similar:
  ```bash
  ngrok http 3010
  ```
- Verifica que la URL configurada en PayU sea accesible públicamente
- Revisa que el endpoint `/payu/webhook` esté funcionando:
  ```bash
  curl -X POST https://tu-dominio.com/payu/webhook \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "merchant_id=508029&state_pol=4"
  ```

### 5. Error: "Payment method not available"

**Causa**: El método de pago no está habilitado para tu cuenta.

**Solución**:
- Contacta con PayU para habilitar el método de pago
- En sandbox, solo tarjetas de crédito están disponibles por defecto
- Para PSE (Colombia), efectivo, etc., necesitas habilitación especial

---

## ✅ Checklist de implementación {#checklist-de-implementación}

### Backend

- [ ] Instalar axios: `npm install axios`
- [ ] Agregar variables de entorno en `.env`
- [ ] Verificar que `payu.service.ts` esté creado
- [ ] Verificar que rutas `/payu/create` y `/payu/webhook` estén registradas
- [ ] Probar con tarjeta APRO: `4111111111111111`
- [ ] Probar con tarjeta DECLINED: `4097440000000004`
- [ ] Verificar logs en consola:
  ```
  🔧 PayU Configuration: { mode: '🧪 SANDBOX' }
  ```

### Frontend

- [ ] Crear formulario de pago con campos:
  - Número de tarjeta
  - CVV
  - Fecha de expiración
  - Nombre en la tarjeta
- [ ] Llamar a `/payu/create` con datos del comprador
- [ ] Manejar respuesta:
  - `APPROVED` → Redirigir a `/payment/success`
  - `DECLINED` → Redirigir a `/payment/failure`
  - `PENDING` → Redirigir a `/payment/pending`

### Webhook

- [ ] Configurar URL pública del webhook en PayU
- [ ] Validar signature en cada webhook
- [ ] Actualizar estado de orden según `state_pol`
- [ ] Asignar license keys si el pago es APPROVED
- [ ] Retornar `200 OK` siempre (incluso en errores internos)

### Testing

- [ ] Probar flujo completo en sandbox
- [ ] Verificar que se reciba el webhook
- [ ] Confirmar que las license keys se asignen correctamente
- [ ] Probar con diferentes estados (APPROVED, DECLINED, PENDING)
- [ ] Revisar logs de PayU para errores

### Producción

- [ ] Cambiar a credenciales de producción
- [ ] Configurar `NODE_ENV=production`
- [ ] Establecer `PAYU_TEST=false`
- [ ] Configurar certificado SSL (HTTPS obligatorio)
- [ ] Verificar cumplimiento PCI-DSS si guardas datos de tarjetas
- [ ] Configurar webhook con URL de producción
- [ ] Realizar transacciones de prueba con montos pequeños

---

## 📚 Recursos adicionales

- 📖 **Documentación oficial**: https://developers.payulatam.com/latam/es/docs/getting-started.html
- 🔐 **Panel de comercios**: https://merchants.payulatam.com/
- 💳 **Tarjetas de prueba**: https://developers.payulatam.com/latam/es/docs/getting-started/test-your-solution.html
- 🔔 **Webhook**: https://developers.payulatam.com/latam/es/docs/integrations/webcheckout-integration/confirmation-page.html
- 🛠️ **API Reference**: https://developers.payulatam.com/latam/es/docs/services.html

---

## 🆘 Soporte

Si tienes problemas:

1. Revisa los logs de tu aplicación (`LOG_LEVEL=debug`)
2. Consulta la documentación oficial de PayU
3. Contacta al soporte técnico de PayU:
   - Email: soporte@payulatam.com
   - Teléfono: Varía por país (consulta en el panel)
4. Revisa los errores comunes en esta guía

---

**¡Listo!** Ya tienes PayU Latam configurado en tu aplicación. 🎉
