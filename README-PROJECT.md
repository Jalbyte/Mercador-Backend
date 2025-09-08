# 📚 Documentación Completa - Proyecto Mercador

## 🎯 Visión General

**Mercador** es una plataforma completa de e-commerce especializada en la venta de licencias de software, construida con tecnologías modernas y siguiendo las mejores prácticas de desarrollo de software.

## 🏗️ Arquitectura del Sistema

### Componentes Principales

```
🏢 Proyecto Mercador
├── 🎨 Mercador-Frontend (Next.js + TypeScript)
├── ⚙️ Mercador-Backend (Hono.js + TypeScript)
└── 🏗️ mercador-infra (Docker + Monitoring)
```

### Arquitectura Técnica

#### Frontend Layer
- **Framework**: Next.js 14 con App Router
- **Lenguaje**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: React Context + Custom Hooks
- **Testing**: Jest + React Testing Library + Playwright

#### Backend Layer
- **Framework**: Hono.js (alternativa moderna a Express)
- **Lenguaje**: TypeScript
- **Base de Datos**: Supabase (PostgreSQL + Auth)
- **Cache**: Redis
- **Autenticación**: JWT + Supabase Auth + MFA
- **Documentación**: OpenAPI/Swagger

#### Infrastructure Layer
- **Orquestación**: Docker Compose
- **Monitoreo**: Prometheus + Grafana
- **Base de Datos**: PostgreSQL
- **Cache**: Redis
- **Reverse Proxy**: Nginx

## 🚀 Inicio Rápido

### Prerrequisitos
- Node.js 18+
- Docker y Docker Compose
- Git

### Instalación Completa

#### 1. Clonar todos los repositorios
```bash
# Backend
git clone <backend-repo-url>
cd Mercador-Backend
npm install

# Frontend
git clone <frontend-repo-url>
cd ../Mercador-Frontend
npm install

# Infraestructura
git clone <infra-repo-url>
cd ../mercador-infra
```

#### 2. Configurar infraestructura
```bash
cd mercador-infra
docker-compose up -d
```

#### 3. Configurar backend
```bash
cd ../Mercador-Backend
cp .env.example .env
# Configurar variables de entorno
npm run dev
```

#### 4. Configurar frontend
```bash
cd ../Mercador-Frontend
cp .env.example .env.local
# Configurar variables de entorno
npm run dev
```

#### 5. Acceder a la aplicación
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3010
- **Documentación API**: http://localhost:3010/openapi
- **Grafana**: http://localhost:3001
- **Prometheus**: http://localhost:9090

## 📋 Funcionalidades del Sistema

### 👤 Gestión de Usuarios
- ✅ **Registro e Inicio de Sesión**: Email/contraseña + redes sociales
- ✅ **Autenticación de Dos Factores**: TOTP con QR codes
- ✅ **Recuperación de Contraseña**: Flujo completo con email
- ✅ **Perfiles de Usuario**: Información personal + imagen de perfil
- ✅ **Roles y Permisos**: Cliente, Admin, etc.

### 🛒 E-commerce Core
- ✅ **Catálogo de Productos**: Búsqueda, filtros y paginación
- ✅ **Carrito de Compras**: Gestión persistente del carrito
- ✅ **Proceso de Checkout**: Flujo completo de compra
- ✅ **Historial de Órdenes**: Seguimiento de pedidos
- ✅ **Gestión de Inventario**: Control de stock en tiempo real

### 👨‍💼 Panel de Administración
- ✅ **CRUD de Productos**: Crear, editar, eliminar productos
- ✅ **Gestión de Usuarios**: Administración de cuentas
- ✅ **Analytics**: Métricas y reportes de negocio
- ✅ **Configuración del Sistema**: Parámetros globales

### 📊 Monitoreo y Analytics
- ✅ **Métricas de Rendimiento**: Core Web Vitals
- ✅ **Monitoreo de Sistema**: CPU, memoria, disco
- ✅ **Logs Centralizados**: Seguimiento de eventos
- ✅ **Alertas**: Notificaciones automáticas
- ✅ **Dashboards**: Visualización en Grafana

## 🛠️ Stack Tecnológico Detallado

### Frontend Technologies
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Next.js | 14.x | Framework React con SSR/SSG |
| React | 18.x | Biblioteca de UI |
| TypeScript | 5.x | Tipado estático |
| Tailwind CSS | 3.x | Framework CSS utilitario |
| React Hook Form | 7.x | Manejo de formularios |
| Zod | 3.x | Validación de esquemas |
| Jest | 29.x | Testing framework |
| Playwright | 1.x | E2E testing |

### Backend Technologies
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Hono.js | 3.x | Framework web moderno |
| Node.js | 18.x | Runtime de JavaScript |
| TypeScript | 5.x | Tipado estático |
| Supabase | 2.x | Backend-as-a-Service |
| Redis | 7.x | Cache y sesiones |
| PostgreSQL | 15.x | Base de datos relacional |
| JWT | 9.x | Autenticación stateless |
| Pino | 8.x | Logging estructurado |
| Prometheus | 2.x | Métricas |

### Infrastructure Technologies
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Docker | 24.x | Contenedorización |
| Docker Compose | 2.x | Orquestación de contenedores |
| Nginx | 1.x | Reverse proxy y load balancer |
| Grafana | 10.x | Visualización de métricas |
| Prometheus | 2.x | Recolección de métricas |
| PostgreSQL | 15.x | Base de datos |
| Redis | 7.x | Cache |

## 🔧 Configuración de Desarrollo

### Variables de Entorno

#### Backend (.env)
```env
# Servidor
NODE_ENV=development
PORT=3010

# Supabase
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Redis
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your-redis-password

# JWT
JWT_SECRET=your-super-secret-jwt-key

# Logging
LOG_LEVEL=info
```

#### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:3010
NEXT_PUBLIC_APP_NAME=Mercador
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

#### Infraestructura (.env)
```env
POSTGRES_PASSWORD=your-secure-password
REDIS_PASSWORD=your-redis-password
GRAFANA_ADMIN_PASSWORD=your-admin-password
```

## 🧪 Estrategia de Testing

### Testing Pyramid

#### 1. Unit Tests (Base de la pirámide)
```typescript
// Component unit test
describe('Button', () => {
  it('renders with correct text', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })
})
```

#### 2. Integration Tests (Capa media)
```typescript
// API integration test
describe('POST /auth/login', () => {
  it('returns 200 with valid credentials', async () => {
    const response = await request(app)
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'password' })
      .expect(200)
  })
})
```

#### 3. E2E Tests (Cima de la pirámide)
```typescript
// User journey test
test('complete purchase flow', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="product-card"]')
  await page.click('[data-testid="add-to-cart"]')
  await page.click('[data-testid="checkout"]')
  // ... complete flow
})
```

### Cobertura de Testing
- **Unit Tests**: > 80% cobertura
- **Integration Tests**: APIs críticas
- **E2E Tests**: Flujos de usuario principales

## 🚀 Despliegue y Producción

### Estrategias de Despliegue

#### Desarrollo
```bash
# Desarrollo local completo
docker-compose -f mercador-infra/docker-compose.yml up -d
npm run dev # en backend y frontend
```

#### Staging
```bash
# Despliegue de staging
docker-compose -f docker-compose.staging.yml up -d
```

#### Producción
```bash
# Despliegue de producción
docker-compose -f docker-compose.prod.yml up -d
```

### CI/CD Pipeline
```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run tests
        run: npm run test:ci

  deploy-backend:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Railway/Vercel

  deploy-frontend:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Vercel
```

## 📊 Monitoreo y Observabilidad

### Métricas Recopiladas

#### Application Metrics
- **HTTP Requests**: Total, por endpoint, códigos de respuesta
- **Response Time**: Latencia promedio, percentiles
- **Error Rate**: Tasa de errores por endpoint
- **Active Users**: Usuarios concurrentes

#### System Metrics
- **CPU Usage**: Porcentaje de uso de CPU
- **Memory Usage**: RAM utilizada
- **Disk I/O**: Operaciones de disco
- **Network I/O**: Tráfico de red

#### Business Metrics
- **Orders**: Órdenes procesadas por día
- **Revenue**: Ingresos generados
- **Conversion Rate**: Tasa de conversión
- **User Retention**: Retención de usuarios

### Alertas Configuradas
```yaml
# Alert rules
groups:
  - name: application
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05
        for: 5m
        labels:
          severity: critical

      - alert: SlowResponseTime
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 3m
        labels:
          severity: warning
```

## 🔒 Seguridad

### Medidas Implementadas

#### Autenticación y Autorización
- ✅ **JWT Tokens**: Autenticación stateless
- ✅ **MFA**: Autenticación de dos factores
- ✅ **Role-Based Access**: Control de acceso por roles
- ✅ **Session Management**: Manejo seguro de sesiones

#### Protección de Datos
- ✅ **Input Validation**: Validación con Zod schemas
- ✅ **SQL Injection Prevention**: Prepared statements
- ✅ **XSS Protection**: Sanitización de datos
- ✅ **CSRF Protection**: Tokens CSRF

#### Infraestructura Segura
- ✅ **HTTPS Only**: Encriptación en tránsito
- ✅ **Security Headers**: Headers de seguridad HTTP
- ✅ **Rate Limiting**: Protección contra ataques DDoS
- ✅ **Firewall**: Reglas de firewall configuradas

### Cumplimiento
- ✅ **OWASP Top 10**: Mitigación de vulnerabilidades comunes
- ✅ **GDPR**: Protección de datos personales
- ✅ **PCI DSS**: Cumplimiento para pagos (si aplica)

## 📈 Escalabilidad

### Estrategias de Escalado

#### Horizontal Scaling
```yaml
# Backend scaling
services:
  backend:
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
```

#### Database Scaling
```yaml
# Read replicas
services:
  postgres-replica:
    image: postgres:15
    environment:
      - POSTGRES_MASTER_HOST=postgres
```

#### Cache Scaling
```yaml
# Redis cluster
services:
  redis-cluster:
    image: redis:7-alpine
    command: redis-server --cluster-enabled yes
```

### Performance Optimization

#### Frontend
- ✅ **Code Splitting**: Carga lazy de componentes
- ✅ **Image Optimization**: Next.js Image component
- ✅ **Bundle Analysis**: Análisis de bundle size
- ✅ **Caching**: Service Worker para assets

#### Backend
- ✅ **Connection Pooling**: Reutilización de conexiones DB
- ✅ **Query Optimization**: Índices y queries eficientes
- ✅ **Caching**: Redis para datos frecuentes
- ✅ **Compression**: Gzip para respuestas

## 🤝 Contribución

### Guías de Desarrollo
1. **Git Flow**: Ramas feature/* para desarrollo
2. **Code Reviews**: Aprobación requerida para merges
3. **Testing**: Tests requeridos para nuevas funcionalidades
4. **Documentation**: Documentación actualizada

### Estándares de Código
- ✅ **TypeScript Strict**: Configuración estricta
- ✅ **ESLint**: Reglas de linting configuradas
- ✅ **Prettier**: Formateo automático de código
- ✅ **Husky**: Pre-commit hooks

### Proceso de Contribución
```bash
# 1. Crear rama feature
git checkout -b feature/nueva-funcionalidad

# 2. Desarrollar y testear
npm run test
npm run lint

# 3. Commit con mensaje descriptivo
git commit -m "feat: agregar nueva funcionalidad"

# 4. Push y crear PR
git push origin feature/nueva-funcionalidad
```

## 📚 Documentación Técnica

### Documentos Disponibles
- ✅ **[Backend Docs](./Mercador-Backend/DOCS.md)**: Arquitectura backend detallada
- ✅ **[Frontend Docs](./Mercador-Frontend/DOCS.md)**: Arquitectura frontend detallada
- ✅ **[Infra Docs](./mercador-infra/README.md)**: Infraestructura y despliegue
- ✅ **[API Docs](http://localhost:3010/openapi)**: Documentación OpenAPI

### Diagramas de Arquitectura
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │    │ Infrastructure  │
│   (Next.js)     │◄──►│   (Hono.js)     │◄──►│   (Docker)      │
│                 │    │                 │    │                 │
│ • React 18      │    │ • TypeScript    │    │ • PostgreSQL    │
│ • TypeScript    │    │ • Supabase      │    │ • Redis         │
│ • Tailwind      │    │ • Redis         │    │ • Prometheus    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🔧 Troubleshooting

### Problemas Comunes

#### Error de Conexión a Base de Datos
```bash
# Verificar estado de PostgreSQL
docker-compose logs postgres

# Reiniciar servicio
docker-compose restart postgres
```

#### Problemas de Cache Redis
```bash
# Verificar conectividad
docker-compose exec redis redis-cli ping

# Limpiar cache
docker-compose exec redis redis-cli FLUSHALL
```

#### Errores de Build
```bash
# Limpiar cache de build
rm -rf node_modules/.cache
npm run build
```

### Logs y Debugging
```bash
# Ver logs de todos los servicios
docker-compose logs -f

# Ver logs de un servicio específico
docker-compose logs -f backend

# Debug mode
NODE_ENV=development DEBUG=* npm run dev
```

## 📞 Soporte y Comunidad

### Canales de Soporte
- **📧 Email**: support@mercador.com
- **💬 Discord**: Comunidad de desarrolladores
- **🐛 Issues**: GitHub Issues para bugs
- **📖 Wiki**: Documentación técnica

### Recursos Adicionales
- **🎯 Roadmap**: [Proyecto Roadmap](https://github.com/org/mercador/projects)
- **📊 Analytics**: Métricas de uso
- **🔍 Status Page**: Estado de servicios
- **📚 Academy**: Tutoriales y guías

## 📝 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para más detalles.

## 🙏 Agradecimientos

### Tecnologías y Herramientas
- **Next.js** - Framework React excepcional
- **Hono.js** - Framework web moderno y rápido
- **Supabase** - Backend-as-a-Service completo
- **Tailwind CSS** - Sistema de diseño utilitario
- **Docker** - Contenedorización simplificada
- **Prometheus/Grafana** - Monitoreo y observabilidad

### Comunidad
- **Contribuidores**: Comunidad de desarrolladores
- **Beta Testers**: Usuarios que prueban nuevas funcionalidades
- **Mentores**: Guías técnicos y consejos
- **Open Source**: Proyectos que hacen posible Mercador

---

**🚀 Mercador - Construyendo el futuro del e-commerce para licencias de software**

*Desarrollado con ❤️ usando tecnologías modernas y mejores prácticas*
