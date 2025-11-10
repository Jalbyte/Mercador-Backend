import { describe, it, expect, beforeEach, vi } from 'vitest'
import '../mocks/supabase.mock.js'
import { mockSupabaseClient, resetSupabaseMocks } from '../mocks/supabase.mock.js'
import * as productService from '@/services/product.service.js'
import { OpenAPIHono } from '@hono/zod-openapi'
import productRoutes from '@/routes/products.js'

/**
 * TestRail Case ID: C75
 * Title: Creación de producto con datos válidos (Admin)
 * 
 * Steps:
 * 1. Autenticarse como usuario con rol 'admin' → Token de acceso válido con rol admin
 * 2. Construir producto completo → Dar clic en crear producto
 * 3. Verificar código de estado → 201 (Created)
 * 4. Verificar cuerpo de respuesta → Contiene detalles del producto creado (id, nombre, descripción, precio, stock, imagen, categoría, tipo)
 * 5. Verificar en Supabase → Producto existe en la base de datos con los datos correctos
 * 
 * Expected Results:
 * - Código de respuesta 201
 * - Respuesta contiene todos los campos del producto
 * - Producto se crea correctamente en la base de datos
 * - Datos coinciden con los enviados
 */

describe('C75: Creación de producto con datos válidos (Admin)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetSupabaseMocks()
  })

  // Helper para mockear el flujo completo de creación de producto
  const mockProductCreation = (mockLicenseType: any, mockCreatedProduct: any) => {
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
  }

  it('C75-1: Admin debe poder crear producto con datos válidos', async () => {
    // Step 1: Autenticarse como admin (simulado con mock)
    const mockAdminUser = {
      id: 'admin-user-id-123',
      email: 'admin@mercador.com',
      user_metadata: {
        role: 'admin',
        full_name: 'Admin User',
      },
    }

    // Step 2: Construir producto completo
    const productData = {
      name: 'Microsoft Office 2024',
      description: 'Suite de productividad completa con Word, Excel, PowerPoint y más',
      price: 149.99,
      category: 'Software',
      image_url: 'https://example.com/images/office-2024.jpg',
      stock_quantity: 100,
      license_type: 'license-123',
    }

    // Mock del producto creado
    const mockCreatedProduct = {
      id: 'product-123',
      ...productData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      product_keys: [],
      license_category: { id: 'license-123', type: 'Perpetua' },
    }

    const mockLicenseType = { id: 'license-123', type: 'Perpetua' }

    // Mock chain usando helper
    mockProductCreation(mockLicenseType, mockCreatedProduct)

    // Act: Crear producto
    const result = await productService.createProduct(productData)

    // Step 4: Verificar que el producto fue creado
    expect(result).toBeDefined()
    expect(result.id).toBeDefined()
    expect(result.name).toBe(productData.name)
    expect(result.description).toBe(productData.description)
    expect(result.price).toBe(productData.price)
    expect(result.category).toBe(productData.category)
    expect(result.stock_quantity).toBe(productData.stock_quantity)
    expect(result.license_type).toBe(productData.license_type)
  })

  it('C75-2: Endpoint POST /products debe retornar 201 con producto creado', async () => {
    // Arrange: montar rutas de productos
    const app = new OpenAPIHono()
    app.route('/products', productRoutes)

    const mockLicenseType = {
      id: 'license-123',
      type: 'Perpetua',
    }

    const productData = {
      name: 'Adobe Photoshop 2024',
      description: 'Software de edición de imágenes profesional',
      price: 299.99,
      category: 'Diseño',
      image_url: 'https://example.com/images/photoshop-2024.jpg',
      stock_quantity: 50,
      license_type: 'license-123',
    }

    const mockCreatedProduct = {
      id: 'product-456',
      ...productData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    // Mock Supabase para validación de license_type y creación
    mockProductCreation(mockLicenseType, mockCreatedProduct)

    // Step 2-3: Hacer POST a /products
    const req = new Request('http://localhost/products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(productData),
    })

    const res = await app.fetch(req as any)

    // Step 3: Verificar código de estado 201
    expect(res.status).toBe(201)

    // Step 4: Verificar cuerpo de respuesta
    const json = await res.json() as {
      success: boolean
      data: {
        id: string
        name: string
        description: string
        price: number
        category: string
        image_url?: string
        stock_quantity: number
        license_type: string
        created_at: string
        updated_at: string
      }
    }

    expect(json.success).toBe(true)
    expect(json.data).toBeDefined()
    expect(json.data.id).toBeDefined()
    expect(json.data.name).toBe(productData.name)
    expect(json.data.description).toBe(productData.description)
    expect(json.data.price).toBe(productData.price)
    expect(json.data.category).toBe(productData.category)
    expect(json.data.stock_quantity).toBe(productData.stock_quantity)
    expect(json.data.license_type).toBe(productData.license_type)
    expect(json.data.created_at).toBeDefined()
    expect(json.data.updated_at).toBeDefined()
  })

  it('C75-3: Producto creado debe tener todos los campos requeridos', async () => {
    // Arrange
    const app = new OpenAPIHono()
    app.route('/products', productRoutes)

    const mockLicenseType = { id: 'license-789', type: 'Suscripción' }

    const productData = {
      name: 'Antivirus Norton 360',
      description: 'Protección completa contra malware, ransomware y amenazas en línea',
      price: 59.99,
      category: 'Seguridad',
      image_url: 'https://example.com/images/norton-360.jpg',
      stock_quantity: 200,
      license_type: 'license-789',
    }

    const mockCreatedProduct = {
      id: 'product-789',
      ...productData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    mockProductCreation(mockLicenseType, mockCreatedProduct)

    // Act
    const req = new Request('http://localhost/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productData),
    })

    const res = await app.fetch(req as any)
    const json = await res.json() as { success: boolean; data: any }

    // Assert: Verificar que contiene todos los campos esperados
    expect(json.data).toHaveProperty('id')
    expect(json.data).toHaveProperty('name')
    expect(json.data).toHaveProperty('description')
    expect(json.data).toHaveProperty('price')
    expect(json.data).toHaveProperty('category')
    expect(json.data).toHaveProperty('stock_quantity')
    expect(json.data).toHaveProperty('license_type')
    expect(json.data).toHaveProperty('created_at')
    expect(json.data).toHaveProperty('updated_at')

    // Verificar tipos de datos
    expect(typeof json.data.id).toBe('string')
    expect(typeof json.data.name).toBe('string')
    expect(typeof json.data.description).toBe('string')
    expect(typeof json.data.price).toBe('number')
    expect(typeof json.data.category).toBe('string')
    expect(typeof json.data.stock_quantity).toBe('number')
    expect(typeof json.data.license_type).toBe('string')
  })

  it('C75-4: Creación de producto debe validar license_type válido', async () => {
    // Arrange
    const productData = {
      name: 'Test Product',
      description: 'Test Description',
      price: 99.99,
      category: 'Test',
      stock_quantity: 10,
      license_type: 'invalid-license-id',
    }

    // Mock: license_type no existe
    vi.mocked(mockSupabaseClient.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'License type not found', code: 'PGRST116' },
      }),
    } as any)

    // Act & Assert: Debe lanzar error
    await expect(productService.createProduct(productData))
      .rejects
      .toThrow(/Invalid license_type/)
  })

  it('C75-5: Producto con imagen debe incluir image_url en respuesta', async () => {
    // Arrange
    const app = new OpenAPIHono()
    app.route('/products', productRoutes)

    const mockLicenseType = { id: 'license-123', type: 'Perpetua' }

    const productData = {
      name: 'Windows 11 Pro',
      description: 'Sistema operativo Windows 11 Professional',
      price: 199.99,
      category: 'Sistema Operativo',
      image_url: 'https://cdn.mercador.com/products/windows-11-pro.png',
      stock_quantity: 150,
      license_type: 'license-123',
    }

    const mockCreatedProduct = {
      id: 'product-win11',
      ...productData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    mockProductCreation(mockLicenseType, mockCreatedProduct)

    // Act
    const req = new Request('http://localhost/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productData),
    })

    const res = await app.fetch(req as any)
    const json = await res.json() as { success: boolean; data: any }

    // Assert: image_url debe estar presente
    expect(json.data.image_url).toBeDefined()
    expect(json.data.image_url).toBe(productData.image_url)
  })

  it('C75-6: Producto creado debe tener stock_quantity correcto', async () => {
    // Arrange
    const app = new OpenAPIHono()
    app.route('/products', productRoutes)

    const mockLicenseType = { id: 'license-123', type: 'Perpetua' }

    const productData = {
      name: 'Test Product Stock',
      description: 'Testing stock quantity',
      price: 50.00,
      category: 'Test',
      stock_quantity: 500,
      license_type: 'license-123',
    }

    const mockCreatedProduct = {
      id: 'product-stock-test',
      ...productData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    mockProductCreation(mockLicenseType, mockCreatedProduct)

    // Act
    const req = new Request('http://localhost/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productData),
    })

    const res = await app.fetch(req as any)
    const json = await res.json() as { success: boolean; data: any }

    // Assert: stock_quantity debe coincidir
    expect(json.data.stock_quantity).toBe(productData.stock_quantity)
    expect(json.data.stock_quantity).toBeGreaterThanOrEqual(0)
  })
})
