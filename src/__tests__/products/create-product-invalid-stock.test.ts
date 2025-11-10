import { describe, it, expect, beforeEach, vi } from 'vitest'
import '../mocks/supabase.mock.js'
import { mockSupabaseClient, resetSupabaseMocks } from '../mocks/supabase.mock.js'
import * as productService from '@/services/product.service.js'
import { OpenAPIHono } from '@hono/zod-openapi'
import productRoutes from '@/routes/products.js'

/**
 * TestRail Case ID: C81
 * Title: Creación de producto - Cantidad inválida (cantidad <= 0)
 * 
 * Steps:
 * 1. Autenticarse como usuario con rol 'admin' → Token válido con rol admin
 * 2. Construir producto desde el dashboard → Llenar formulario
 * 3. Incluir datos válidos excepto 'cantidad' (stock_quantity) que debe ser 0 o negativa
 * 4. Verificar código de estado HTTP → Debe ser 400 Bad Request
 * 
 * Expected Results:
 * - La solicitud es rechazada con código 400
 * - Se retorna un mensaje de error indicando que la cantidad es inválida
 * - El producto NO se crea en la base de datos
 * - La validación ocurre antes de acceder a la base de datos
 */

describe('C81: Creación de producto - Cantidad inválida (cantidad <= 0)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetSupabaseMocks()
  })

  it('C81-1: Endpoint debe rechazar producto con cantidad igual a 0', async () => {
    // Arrange: montar rutas de productos
    const app = new OpenAPIHono()
    app.route('/products', productRoutes)

    // Step 3: Producto con stock_quantity = 0
    const productData = {
      name: 'Test Product',
      description: 'Test Description',
      price: 99.99, // ✅ Precio válido
      category: 'Test',
      stock_quantity: 0, // ❌ Cantidad inválida
      license_type: 'license-123',
    }

    // Act: Intentar crear producto con cantidad 0
    const req = new Request('http://localhost/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productData),
    })

    const res = await app.fetch(req as any)

    // Step 4: Verificar código de estado 400
    expect(res.status).toBe(400)

    const json = await res.json() as { success: boolean; error?: any }
    
    // Debe indicar que hubo un error
    expect(json.success).toBe(false)
    expect(json.error).toBeDefined()
  })

  it('C81-2: Endpoint debe rechazar producto con cantidad negativa', async () => {
    // Arrange
    const app = new OpenAPIHono()
    app.route('/products', productRoutes)

    // Step 3: Producto con cantidad negativa
    const productData = {
      name: 'Test Product Negative',
      description: 'Test Description',
      price: 49.99,
      category: 'Test',
      stock_quantity: -5, // ❌ Cantidad negativa
      license_type: 'license-123',
    }

    // Act
    const req = new Request('http://localhost/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productData),
    })

    const res = await app.fetch(req as any)

    // Step 4: Debe retornar 400 Bad Request
    expect(res.status).toBe(400)

    const json = await res.json() as { success: boolean; error?: any }
    expect(json.success).toBe(false)
    expect(json.error).toBeDefined()
  })

  it('C81-3: Endpoint debe rechazar producto con cantidad -1', async () => {
    // Arrange
    const app = new OpenAPIHono()
    app.route('/products', productRoutes)

    // Step 3: Producto con cantidad = -1 (caso específico mencionado)
    const productData = {
      name: 'Test Product Minus One',
      description: 'Test Description',
      price: 29.99,
      category: 'Test',
      stock_quantity: -1, // ❌ Cantidad -1
      license_type: 'license-123',
    }

    // Act
    const req = new Request('http://localhost/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productData),
    })

    const res = await app.fetch(req as any)

    // Assert: Código 400
    expect(res.status).toBe(400)
    
    const json = await res.json() as { success: boolean }
    expect(json.success).toBe(false)
  })

  it('C81-4: Schema Zod debe validar cantidad positiva antes de crear producto', async () => {
    // Arrange: Montar rutas
    const app = new OpenAPIHono()
    app.route('/products', productRoutes)

    // Step 3: Producto con cantidad 0
    const productData = {
      name: 'Test Product Service',
      description: 'Test Description',
      price: 99.99,
      category: 'Test',
      stock_quantity: 0, // ❌ Cantidad inválida
      license_type: 'license-123',
    }

    // Act: Intentar crear producto
    const req = new Request('http://localhost/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productData),
    })

    const res = await app.fetch(req as any)
    
    // Assert: Zod debe rechazar en el nivel de validación del schema
    expect(res.status).toBe(400)
    
    const json = await res.json() as { success: boolean; error?: any }
    expect(json.success).toBe(false)
    
    // La validación de Zod debe bloquear antes de llegar al servicio
    expect(mockSupabaseClient.from).not.toHaveBeenCalledWith('products')
  })

  it('C81-5: Mensaje de error debe ser claro sobre cantidad inválida', async () => {
    // Arrange
    const app = new OpenAPIHono()
    app.route('/products', productRoutes)

    const invalidQuantities = [0, -1, -10, -100]

    for (const invalidQty of invalidQuantities) {
      vi.clearAllMocks()
      
      const productData = {
        name: `Test Product Qty ${invalidQty}`,
        description: 'Test Description',
        price: 99.99,
        category: 'Test',
        stock_quantity: invalidQty, // ❌ Cantidad inválida
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

      // Assert: El error debe mencionar la cantidad/stock
      expect(res.status).toBe(400)
      expect(json.success).toBe(false)
      expect(json.error).toBeDefined()
      
      // El mensaje de error debe ser útil (Zod puede retornar array de errores)
      const errorMessage = typeof json.error === 'string' 
        ? json.error.toLowerCase() 
        : JSON.stringify(json.error).toLowerCase()
      
      // Debe mencionar algo sobre stock/cantidad, número positivo, o ser error de validación
      const mentionsStock = errorMessage.includes('stock') || 
                           errorMessage.includes('cantidad') ||
                           errorMessage.includes('quantity') ||
                           errorMessage.includes('positive') ||
                           errorMessage.includes('positivo') ||
                           errorMessage.includes('greater') ||
                           errorMessage.includes('mayor') ||
                           errorMessage.includes('number must be greater') || // Zod error
                           errorMessage.includes('validation') ||
                           errorMessage.includes('invalid')
      
      expect(mentionsStock).toBe(true)
    }
  })

  it('C81-6: Producto con cantidad válida (>0) debe ser aceptado', async () => {
    // Test de contraste: verificar que cantidades válidas SÍ funcionan
    const app = new OpenAPIHono()
    app.route('/products', productRoutes)

    const mockLicenseType = { id: 'license-123', type: 'Perpetua' }
    
    const productData = {
      name: 'Valid Product',
      description: 'Test Description',
      price: 99.99,
      category: 'Test',
      stock_quantity: 50, // ✅ Cantidad válida
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

    // Assert: Con cantidad válida debe funcionar
    expect(res.status).toBe(201)
    
    const json = await res.json() as { success: boolean; data: any }
    expect(json.success).toBe(true)
    expect(json.data.stock_quantity).toBe(productData.stock_quantity)
  })

  it('C81-7: Validación debe ocurrir antes de acceder a la base de datos', async () => {
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
      price: 99.99,
      category: 'Test',
      stock_quantity: -20, // ❌ Cantidad inválida
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

  it('C81-8: Múltiples campos inválidos deben reportarse claramente', async () => {
    // Probar combinación: precio Y cantidad inválidos
    const app = new OpenAPIHono()
    app.route('/products', productRoutes)

    const productData = {
      name: 'Test Product',
      description: 'Test Description',
      price: -10, // ❌ Precio inválido
      category: 'Test',
      stock_quantity: -5, // ❌ Cantidad inválida
      license_type: 'license-123',
    }

    // Act
    const req = new Request('http://localhost/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productData),
    })

    const res = await app.fetch(req as any)

    // Assert: Debe retornar 400 y reportar los errores
    expect(res.status).toBe(400)
    
    const json = await res.json() as { success: boolean; error?: any }
    expect(json.success).toBe(false)
    expect(json.error).toBeDefined()
    
    // El error debe mencionar los problemas (puede ser array o string)
    const errorStr = JSON.stringify(json.error).toLowerCase()
    
    // Debe mencionar ambos problemas o al menos validación general
    const hasValidationError = errorStr.includes('price') || 
                               errorStr.includes('precio') ||
                               errorStr.includes('stock') ||
                               errorStr.includes('cantidad') ||
                               errorStr.includes('validation') ||
                               errorStr.includes('validación')
    
    expect(hasValidationError).toBe(true)
  })
})
