import { describe, it, expect, beforeEach, vi } from 'vitest'
import '../mocks/supabase.mock.js'
import { mockSupabaseClient, resetSupabaseMocks } from '../mocks/supabase.mock.js'
import * as productService from '@/services/product.service.js'
import { OpenAPIHono } from '@hono/zod-openapi'
import productRoutes from '@/routes/products.js'

/**
 * TestRail Case ID: C80
 * Title: Creación de producto - Precio inválido (precio <= 0)
 * 
 * Steps:
 * 1. Autenticarse como usuario con rol 'admin' → Token válido con rol admin
 * 2. Crear producto desde el dashboard → Completar formulario
 * 3. Incluir todos los campos requeridos con precio <= 0 → Precio inválido
 * 4. Verificar cuerpo de respuesta → Mensaje de error indicando validación fallida
 * 
 * Expected Results:
 * - La solicitud es rechazada
 * - Se retorna un código de error (400 o 422)
 * - La respuesta contiene un mensaje de error indicando que el precio es inválido
 * - El producto NO se crea en la base de datos
 */

describe('C80: Creación de producto - Precio inválido (precio <= 0)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetSupabaseMocks()
  })

  it('C80-1: Endpoint debe rechazar producto con precio igual a 0', async () => {
    // Arrange: montar rutas de productos
    const app = new OpenAPIHono()
    app.route('/products', productRoutes)

    // Step 3: Producto con precio = 0
    const productData = {
      name: 'Test Product',
      description: 'Test Description',
      price: 0, // ❌ Precio inválido
      category: 'Test',
      stock_quantity: 10,
      license_type: 'license-123',
    }

    // Act: Intentar crear producto con precio 0
    const req = new Request('http://localhost/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productData),
    })

    const res = await app.fetch(req as any)

    // Step 4: Verificar respuesta de error
    expect(res.status).toBeGreaterThanOrEqual(400) // 400 o 422
    expect(res.status).toBeLessThan(500)

    const json = await res.json() as { success: boolean; error?: any }
    
    // Debe indicar que hubo un error
    expect(json.success).toBe(false)
    expect(json.error).toBeDefined()
  })

  it('C80-2: Endpoint debe rechazar producto con precio negativo', async () => {
    // Arrange
    const app = new OpenAPIHono()
    app.route('/products', productRoutes)

    // Step 3: Producto con precio negativo
    const productData = {
      name: 'Test Product Negative',
      description: 'Test Description',
      price: -10.50, // ❌ Precio negativo
      category: 'Test',
      stock_quantity: 10,
      license_type: 'license-123',
    }

    // Act
    const req = new Request('http://localhost/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productData),
    })

    const res = await app.fetch(req as any)

    // Assert: Debe rechazar la solicitud
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)

    const json = await res.json() as { success: boolean; error?: any }
    expect(json.success).toBe(false)
    expect(json.error).toBeDefined()
  })

  it('C80-3: Endpoint debe rechazar producto con precio muy pequeño (-0.01)', async () => {
    // Arrange
    const app = new OpenAPIHono()
    app.route('/products', productRoutes)

    // Step 3: Producto con precio -0.01
    const productData = {
      name: 'Test Product Small Negative',
      description: 'Test Description',
      price: -0.01, // ❌ Precio negativo muy pequeño
      category: 'Test',
      stock_quantity: 10,
      license_type: 'license-123',
    }

    // Act
    const req = new Request('http://localhost/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productData),
    })

    const res = await app.fetch(req as any)

    // Assert
    expect(res.status).toBeGreaterThanOrEqual(400)
    const json = await res.json() as { success: boolean }
    expect(json.success).toBe(false)
  })

  it('C80-4: Servicio debe validar precio positivo antes de crear producto', async () => {
    // Arrange: Mock de Supabase para validar license_type
    const mockLicenseType = { id: 'license-123', type: 'Perpetua' }
    
    vi.mocked(mockSupabaseClient.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockLicenseType, error: null }),
    } as any)

    // Step 3: Producto con precio 0
    const productData = {
      name: 'Test Product Service',
      description: 'Test Description',
      price: 0, // ❌ Precio inválido
      category: 'Test',
      stock_quantity: 10,
      license_type: 'license-123',
    }

    // Act & Assert: Debe lanzar error o validarse antes
    // Nota: El schema de Zod valida esto antes de llegar al servicio
    // pero si llega, el servicio debería manejarlo
    const app = new OpenAPIHono()
    app.route('/products', productRoutes)

    const req = new Request('http://localhost/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productData),
    })

    const res = await app.fetch(req as any)
    
    // Verificar que la validación funcionó
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(mockSupabaseClient.from).not.toHaveBeenCalledWith('products') // No debe intentar insertar
  })

  it('C80-5: Mensaje de error debe ser claro sobre precio inválido', async () => {
    // Arrange
    const app = new OpenAPIHono()
    app.route('/products', productRoutes)

    const invalidPrices = [0, -1, -10.50, -100]

    for (const invalidPrice of invalidPrices) {
      vi.clearAllMocks()
      
      const productData = {
        name: `Test Product Price ${invalidPrice}`,
        description: 'Test Description',
        price: invalidPrice,
        category: 'Test',
        stock_quantity: 10,
        license_type: 'license-123',
      }

      // Act
      const req = new Request('http://localhost/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productData),
      })

      const res = await app.fetch(req as any)
      const json = await res.json() as { success: boolean; error?: any }

      // Assert: El error debe mencionar el precio
      expect(res.status).toBeGreaterThanOrEqual(400)
      expect(json.success).toBe(false)
      expect(json.error).toBeDefined()
      
      // El mensaje de error debe ser útil
      const errorMessage = typeof json.error === 'string' 
        ? json.error.toLowerCase() 
        : JSON.stringify(json.error).toLowerCase()
      
      // Debe mencionar algo sobre precio/price o número/number positivo
      const mentionsPrice = errorMessage.includes('price') || 
                           errorMessage.includes('precio') ||
                           errorMessage.includes('positive') ||
                           errorMessage.includes('positivo') ||
                           errorMessage.includes('greater') ||
                           errorMessage.includes('mayor')
      
      expect(mentionsPrice).toBe(true)
    }
  })

  it('C80-6: Producto con precio válido (>0) debe ser aceptado', async () => {
    // Test de contraste: verificar que precios válidos SÍ funcionan
    const app = new OpenAPIHono()
    app.route('/products', productRoutes)

    const mockLicenseType = { id: 'license-123', type: 'Perpetua' }
    
    const productData = {
      name: 'Valid Product',
      description: 'Test Description',
      price: 99.99, // ✅ Precio válido
      category: 'Test',
      stock_quantity: 10,
      license_type: 'license-123',
    }

    const mockCreatedProduct = {
      id: 'product-valid',
      ...productData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    // Mock el flujo completo
    let callCount = 0
    ;(mockSupabaseClient.from as any).mockImplementation((table: string) => {
      callCount++
      
      if (table === 'license_category') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockLicenseType, error: null }),
        }
      }
      
      if (table === 'products') {
        if (callCount === 2) {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockCreatedProduct, error: null }),
          }
        } else {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: mockCreatedProduct, error: null }),
          }
        }
      }
      
      if (table === 'product_keys') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }
      }
      
      return {}
    })

    // Act
    const req = new Request('http://localhost/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productData),
    })

    const res = await app.fetch(req as any)

    // Assert: Con precio válido debe funcionar
    expect(res.status).toBe(201)
    
    const json = await res.json() as { success: boolean; data: any }
    expect(json.success).toBe(true)
    expect(json.data.price).toBe(productData.price)
  })

  it('C80-7: Validación debe ocurrir antes de acceder a la base de datos', async () => {
    // Verificar que la validación es temprana y no se desperdician recursos
    const app = new OpenAPIHono()
    app.route('/products', productRoutes)

    const insertSpy = vi.fn()
    
    vi.mocked(mockSupabaseClient.from).mockReturnValue({
      insert: insertSpy,
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
    } as any)

    const productData = {
      name: 'Test Product',
      description: 'Test Description',
      price: -50, // ❌ Precio inválido
      category: 'Test',
      stock_quantity: 10,
      license_type: 'license-123',
    }

    // Act
    const req = new Request('http://localhost/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productData),
    })

    await app.fetch(req as any)

    // Assert: No debe haber intentado insertar en la base de datos
    expect(insertSpy).not.toHaveBeenCalled()
  })
})
