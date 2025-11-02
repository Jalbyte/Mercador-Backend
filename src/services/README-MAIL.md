# 📧 Servicio de Email - Mercador Backend

Sistema de envío de emails transaccionales con soporte para reportes en PDF generados dinámicamente.

## 🚀 Quick Start

### 1. Instalar dependencias

```bash
npm install mailgun.js form-data node-fetch puppeteer
```

### 2. Configurar variables de entorno

```bash
# .env
MAILGUN_API_KEY=your-mailgun-api-key
MAILGUN_DOMAIN=auth.mercador.app
FRONTEND_URL=http://localhost:3000
ENABLE_PDF_ATTACH=true
```

### 3. Probar el servicio

```bash
# Enviar email de prueba
TEST_EMAIL=tu-email@example.com npm run test:email
```

## 📖 Uso

### Enviar email simple (sin PDF)

```typescript
import { sendOrderEmail } from './services/mail.service.js'

await sendOrderEmail({
  to: 'cliente@example.com',
  subject: 'Confirmación de orden',
  templatePath: 'http://localhost:3000/api/email/order-status',
  templateQuery: {
    reference: 'ORDER-123',
    status: 'confirmed'
  },
  attachPdf: false
})
```

### Enviar email con PDF adjunto

```typescript
await sendOrderEmail({
  to: 'cliente@example.com',
  subject: 'Orden ORDER-123 - Pago confirmado',
  templatePath: `${FRONTEND_URL}/api/email/order-status`,
  templateQuery: {
    reference: 'ORDER-123',
    status: 'confirmed',
    assigned: JSON.stringify({ '101': 2, '102': 1 })
  },
  attachPdf: true,
  pdfFilename: 'order-123.pdf'
})
```

## 🏗️ Arquitectura

### Flujo de generación de reportes

```
1. Backend hace fetch a template del frontend
   ↓
2. Frontend devuelve HTML renderizado con datos
   ↓
3. Backend genera PDF con Puppeteer (opcional)
   ↓
4. Backend envía email con Mailgun
   ↓
5. Cliente recibe email (con PDF adjunto si está habilitado)
```

### Componentes

#### 1. Mail Service (`src/services/mail.service.ts`)

- `fetchTemplateHtml(url)` - Obtiene HTML del frontend
- `generatePdfFromHtml(html)` - Convierte HTML a PDF con Puppeteer
- `sendOrderEmail(opts)` - Envía email con Mailgun

#### 2. Frontend Template (Next.js API Route)

```typescript
// app/api/email/order-status/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const reference = searchParams.get('reference')
  const status = searchParams.get('status')
  
  return new Response(html, {
    headers: { 'Content-Type': 'text/html' }
  })
}
```

## ⚙️ Configuración

### Variables de Entorno

| Variable | Requerida | Default | Descripción |
|----------|-----------|---------|-------------|
| `MAILGUN_API_KEY` | ✅ Sí | - | API Key de Mailgun |
| `MAILGUN_DOMAIN` | ✅ Sí | `auth.mercador.app` | Dominio verificado |
| `FRONTEND_URL` | ⚠️ Condicional | - | URL del frontend (requerida si ENABLE_PDF_ATTACH=true) |
| `ENABLE_PDF_ATTACH` | ❌ No | `false` | Habilitar adjunto de PDF |

### Mailgun Setup

1. **Crear cuenta**: https://signup.mailgun.com/
2. **Verificar dominio**: Añadir DNS records en tu proveedor
3. **Obtener API Key**: Settings → API Keys
4. **Configurar variables**: Copiar a `.env`

### Puppeteer Setup (para PDFs)

#### Desarrollo local

```bash
npm install puppeteer
```

#### Docker

```dockerfile
FROM node:18-alpine

# Instalar Chromium
RUN apk add --no-cache chromium

# Configurar Puppeteer para usar Chromium del sistema
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY package*.json ./
RUN npm ci --only=production

COPY . .
CMD ["npm", "start"]
```

## 🧪 Testing

### Test manual

```bash
# Configurar email de destino
export TEST_EMAIL=tu-email@example.com

# Ejecutar test
npm run test:email
```

### Test con mocks (Vitest)

```typescript
// __tests__/mail.service.test.ts
import { describe, it, expect, vi } from 'vitest'
import { sendOrderEmail } from '../services/mail.service'

vi.mock('node-fetch')
vi.mock('puppeteer')

describe('sendOrderEmail', () => {
  it('should fetch template and send email', async () => {
    // Mock fetch response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html>Template</html>')
    })

    await sendOrderEmail({
      to: 'test@example.com',
      subject: 'Test',
      templatePath: 'http://localhost:3000/template',
      attachPdf: false
    })

    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/template')
  })
})
```

## 📊 Monitoreo

### Métricas importantes

- **Email delivery rate**: % de emails entregados
- **PDF generation time**: Tiempo promedio de generación
- **Template fetch time**: Latencia del frontend
- **Mailgun API errors**: Errores de envío

### Logs a observar

```typescript
// Success
✉️ Order email sent to cliente@example.com

// Warnings
⚠️ Could not generate PDF attachment: Puppeteer timeout

// Errors
❌ Failed to send order email: Mailgun API error 401
```

## 🐛 Troubleshooting

### Error: "Mailgun client not configured"

**Causa**: `MAILGUN_API_KEY` no está definida

**Solución**:
```bash
# Verificar variable
echo $MAILGUN_API_KEY

# Configurar en .env
MAILGUN_API_KEY=your-key-here
```

### Error: "Failed to fetch template HTML: 404"

**Causa**: Frontend no está corriendo o la ruta no existe

**Solución**:
```bash
# Iniciar frontend
cd ../frontend
npm run dev

# Verificar ruta en navegador
curl http://localhost:3000/api/email/order-status?reference=TEST
```

### Error: "Puppeteer is not installed"

**Causa**: Puppeteer no está instalado y `ENABLE_PDF_ATTACH=true`

**Solución**:
```bash
# Opción 1: Instalar Puppeteer
npm install puppeteer

# Opción 2: Deshabilitar PDF
ENABLE_PDF_ATTACH=false
```

### PDF generation tarda mucho

**Causa**: Template del frontend tiene scripts pesados

**Soluciones**:
1. Optimizar el template (reducir JS/CSS)
2. Aumentar timeout en Puppeteer
3. Usar cache para templates frecuentes
4. Generar PDF en background job (async)

## 🔒 Seguridad

### Mejores prácticas

1. **Validar email destinations**: Verificar que el email es válido antes de enviar
2. **Rate limiting**: Limitar envíos por IP/usuario para evitar spam
3. **Sanitizar inputs**: Escapar parámetros en template URL
4. **SSRF protection**: Validar `FRONTEND_URL` contra whitelist
5. **Secrets management**: No exponer `MAILGUN_API_KEY` en logs

### Ejemplo de validación

```typescript
import { z } from 'zod'

const emailSchema = z.string().email()

function validateEmail(email: string) {
  try {
    emailSchema.parse(email)
    return true
  } catch {
    return false
  }
}

// Uso
if (!validateEmail(customerEmail)) {
  throw new Error('Invalid email address')
}
```

## 🚀 Optimizaciones de Producción

### 1. Pool de browsers Puppeteer

Mantener browsers abiertos reduce latencia:

```typescript
import { BrowserPool } from 'puppeteer-pool'

const pool = new BrowserPool({
  max: 3,
  min: 1,
  launchOptions: {
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
})

async function generatePdf(html: string) {
  const browser = await pool.acquire()
  try {
    const page = await browser.newPage()
    await page.setContent(html)
    return await page.pdf({ format: 'A4' })
  } finally {
    await pool.release(browser)
  }
}
```

### 2. Cache de templates

Evitar fetches repetidos:

```typescript
const templateCache = new Map<string, { html: string, expires: number }>()

async function fetchTemplateHtml(url: string): Promise<string> {
  const cached = templateCache.get(url)
  if (cached && cached.expires > Date.now()) {
    return cached.html
  }
  
  const html = await fetch(url).then(r => r.text())
  templateCache.set(url, { html, expires: Date.now() + 60000 })
  return html
}
```

### 3. Queue de emails

Enviar emails en background:

```typescript
import Bull from 'bull'

const emailQueue = new Bull('emails', REDIS_URL)

emailQueue.process(async (job) => {
  const { to, subject, templatePath, templateQuery } = job.data
  await sendOrderEmail({ to, subject, templatePath, templateQuery })
})

// Agregar job
emailQueue.add({ to, subject, templatePath, templateQuery })
```

## 📚 Referencias

- [Mailgun Documentation](https://documentation.mailgun.com/)
- [Puppeteer API](https://pptr.dev/)
- [Node-fetch GitHub](https://github.com/node-fetch/node-fetch)
- [Mailgun.js GitHub](https://github.com/mailgun/mailgun.js)

---

**Documentación actualizada**: Noviembre 2, 2025
