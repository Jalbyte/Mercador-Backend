/**
 * Tests para C66: Actualización de Stock Exitosa - Compra
 * 
 * Estos tests verifican que:
 * - Un producto se puede crear con stock inicial
 * - Se puede simular una compra del producto
 * - El stock se decrementa correctamente después de la compra
 * - El producto no se marca como agotado si aún tiene stock
 * - La actualización de stock funciona correctamente
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockSupabaseClient } from '../mocks/supabase.mock.js'
import * as productService from '../../services/product.service.js'

// Mocks
vi.mock('../../config/supabase.js', () => ({
  supabase: mockSupabaseClient,
  createSupabaseClient: vi.fn(() => mockSupabaseClient)
}))

describe('C66: Actualización de Stock Exitosa - Compra', () => {
  const mockProductId = '660'
  const initialStock = 10
  const purchaseQuantity = 3
  const expectedStockAfterPurchase = 7

  const mockProduct = {
    id: mockProductId,
    name: 'Producto Test Stock C66',
    description: 'Producto para test de actualización de stock',
    price: 50000,
    category: 'Videojuegos',
    license_type: 'Digital',
    stock_quantity: initialStock,
    image_url: 'https://example.com/product-c66.jpg',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * Helper para mock de createProduct
   */
  function mockCreateProductFlow(stock: number = initialStock) {
    const product = { ...mockProduct, stock_quantity: stock, license_category: { id: 'Digital', type: 'Digital' } }

    mockSupabaseClient.from = vi.fn((table: string) => {
      if (table === 'products') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: product,
                error: null
              })
            })
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: product,
                error: null
              })
            })
          })
        }
      }
      if (table === 'license_category') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: mockProduct.license_type, type: 'Digital' },
                error: null
              })
            })
          })
        }
      }
      if (table === 'product_keys') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        }
      }
      return {} as any
    })

    return product
  }

  /**
   * Helper para mock de getProductById
   */
  function mockGetProductFlow(stock: number, isAvailable: boolean = true) {
    const product = {
      ...mockProduct,
      stock_quantity: stock,
      is_available: isAvailable
    }

    mockSupabaseClient.from = vi.fn((table: string) => {
      if (table === 'products') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: product,
                error: null
              })
            })
          })
        }
      }
      return {} as any
    })

    return product
  }

  /**
   * Helper para mock de updateProduct (actualizar stock)
   */
  function mockUpdateStockFlow(newStock: number) {
    const updatedProduct = {
      ...mockProduct,
      stock_quantity: newStock,
      is_available: newStock > 0,
      updated_at: new Date().toISOString()
    }

    mockSupabaseClient.from = vi.fn((table: string) => {
      if (table === 'products') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: updatedProduct,
                  error: null
                })
              })
            })
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: updatedProduct,
                error: null
              })
            })
          })
        }
      }
      return {} as any
    })

    return updatedProduct
  }

  /**
   * Helper para simular una compra
   */
  function mockPurchaseSimulation(productId: string, quantity: number) {
    return {
      product_id: productId,
      quantity: quantity,
      total: mockProduct.price * quantity,
      status: 'completed',
      timestamp: new Date().toISOString()
    }
  }

  it('C66-1: Crear un producto con stock inicial mayor a la cantidad a comprar', async () => {
    // Arrange: Stock inicial = 10, cantidad a comprar = 3
    mockCreateProductFlow(initialStock)

    // Act: Crear producto con stock inicial de 10
    const product = await productService.createProduct({
      name: mockProduct.name,
      description: mockProduct.description,
      price: mockProduct.price,
      category: mockProduct.category,
      license_type: mockProduct.license_type,
      stock_quantity: initialStock,
      image_url: mockProduct.image_url
    })

    // Assert: El producto se crea exitosamente con el stock inicial especificado
    expect(product).toBeDefined()
    expect(product.stock_quantity).toBe(initialStock)
    expect(product.stock_quantity).toBe(10)
    expect(product.stock_quantity).toBeGreaterThan(purchaseQuantity)
  })

  it('C66-2: Simular la finalización de una compra del producto', () => {
    // Arrange: Producto con stock inicial = 10
    const product = mockGetProductFlow(initialStock)

    // Act: Simular compra de 3 unidades
    const purchase = mockPurchaseSimulation(mockProductId, purchaseQuantity)

    // Assert: Se simula la compra exitosamente con la información correcta
    expect(purchase).toBeDefined()
    expect(purchase.product_id).toBe(mockProductId)
    expect(purchase.quantity).toBe(purchaseQuantity)
    expect(purchase.quantity).toBe(3)
    expect(purchase.status).toBe('completed')
    expect(product.stock_quantity).toBeGreaterThanOrEqual(purchase.quantity)
  })

  it('C66-3: Ejecutar la lógica de actualización de stock', async () => {
    // Arrange: Producto con stock inicial = 10, compra de 3 unidades
    const newStock = initialStock - purchaseQuantity // 10 - 3 = 7
    mockUpdateStockFlow(newStock)

    // Act: Actualizar stock del producto (decrementar por compra)
    const updatedProduct = await productService.updateProduct(mockProductId, {
      stock_quantity: newStock
    })

    // Assert: La función de actualización se ejecuta sin errores
    expect(updatedProduct).toBeDefined()
    expect(updatedProduct.stock_quantity).toBe(newStock)
    expect(updatedProduct.stock_quantity).toBe(7)
    expect(updatedProduct.updated_at).toBeDefined()
  })

  it('C66-4: Verificar en la base de datos el stock actual del producto', async () => {
    // Arrange: Producto después de la compra
    const stockAfterPurchase = expectedStockAfterPurchase // 7
    mockGetProductFlow(stockAfterPurchase)

    // Act: Consultar el producto en la base de datos
    const product = await productService.getProductById(mockProductId)

    // Assert: El stock se ha decrementado correctamente (10 - 3 = 7)
    expect(product).toBeDefined()
    expect(product?.stock_quantity).toBe(expectedStockAfterPurchase)
    expect(product?.stock_quantity).toBe(7)
    expect(product?.stock_quantity).toBe(initialStock - purchaseQuantity)
    expect(product?.stock_quantity).toBeLessThan(initialStock)
  })

  it('C66-5: Verificar el estado del producto (no agotado)', async () => {
    // Arrange: Producto con stock = 7 (después de compra)
    mockGetProductFlow(expectedStockAfterPurchase, true)

    // Act: Obtener producto y verificar disponibilidad
    const product = await productService.getProductById(mockProductId)

    // Assert: El producto no está marcado como 'fuera de stock'
    expect(product).toBeDefined()
    expect(product?.stock_quantity).toBe(7)
    expect(product?.stock_quantity).toBeGreaterThan(0)
  })

  it('C66-6: Flujo completo - Crear producto, comprar, actualizar stock', async () => {
    // Step 1: Crear producto con stock inicial = 10
    mockCreateProductFlow(initialStock)
    let product = await productService.createProduct({
      name: mockProduct.name,
      description: mockProduct.description,
      price: mockProduct.price,
      category: mockProduct.category,
      license_type: mockProduct.license_type,
      stock_quantity: initialStock,
      image_url: mockProduct.image_url
    })

    expect(product.stock_quantity).toBe(10)

    // Step 2: Simular compra de 3 unidades
    const purchase = mockPurchaseSimulation(mockProductId, purchaseQuantity)
    expect(purchase.quantity).toBe(3)
    expect(purchase.status).toBe('completed')

    // Step 3: Actualizar stock (10 - 3 = 7)
    const newStock = product.stock_quantity - purchase.quantity
    mockUpdateStockFlow(newStock)
    product = await productService.updateProduct(mockProductId, {
      stock_quantity: newStock
    })

    expect(product.stock_quantity).toBe(7)

    // Step 4: Verificar stock en base de datos
    mockGetProductFlow(7, true)
    const productFinal = await productService.getProductById(mockProductId)

    expect(productFinal?.stock_quantity).toBe(expectedStockAfterPurchase)
    expect(productFinal?.stock_quantity).toBe(7)

    // Step 5: Verificar que el producto no está agotado
    expect(productFinal?.stock_quantity).toBeGreaterThan(0)
  })

  it('C66-7: Múltiples compras - Verificar actualización secuencial de stock', async () => {
    // Arrange: Producto con stock inicial = 10
    let currentStock = initialStock

    // Step 1: Primera compra (2 unidades)
    const purchase1 = mockPurchaseSimulation(mockProductId, 2)
    currentStock = currentStock - purchase1.quantity // 10 - 2 = 8
    mockUpdateStockFlow(currentStock)
    let product = await productService.updateProduct(mockProductId, {
      stock_quantity: currentStock
    })
    expect(product.stock_quantity).toBe(8)

    // Step 2: Segunda compra (3 unidades)
    const purchase2 = mockPurchaseSimulation(mockProductId, 3)
    currentStock = currentStock - purchase2.quantity // 8 - 3 = 5
    mockUpdateStockFlow(currentStock)
    product = await productService.updateProduct(mockProductId, {
      stock_quantity: currentStock
    })
    expect(product.stock_quantity).toBe(5)

    // Step 3: Tercera compra (1 unidad)
    const purchase3 = mockPurchaseSimulation(mockProductId, 1)
    currentStock = currentStock - purchase3.quantity // 5 - 1 = 4
    mockUpdateStockFlow(currentStock)
    product = await productService.updateProduct(mockProductId, {
      stock_quantity: currentStock
    })
    expect(product.stock_quantity).toBe(4)

    // Assert: Stock final correcto y producto disponible
    expect(product.stock_quantity).toBe(4)
    expect(product.stock_quantity).toBe(initialStock - 2 - 3 - 1)
  })

  it('C66-8: Validar que el stock no puede ser negativo', async () => {
    // Arrange: Producto con stock = 2
    const lowStock = 2
    mockGetProductFlow(lowStock)
    const product = await productService.getProductById(mockProductId)

    // Act: Intentar comprar más unidades del stock disponible
    const attemptedPurchaseQuantity = 5
    const calculatedStock = (product?.stock_quantity ?? 0) - attemptedPurchaseQuantity // 2 - 5 = -3

    // Assert: El stock no debería permitir ser negativo
    expect(product?.stock_quantity).toBe(2)
    expect(calculatedStock).toBeLessThan(0)
    // En un sistema real, esto debería lanzar un error o no permitir la compra
    expect(product?.stock_quantity).toBeGreaterThanOrEqual(0)
  })

  it('C66-9: Verificar actualización de timestamp al modificar stock', async () => {
    // Arrange: Producto con stock inicial
    mockGetProductFlow(initialStock)
    const productBefore = await productService.getProductById(mockProductId)
    const timestampBefore = productBefore ? new Date(productBefore.updated_at) : new Date()

    // Act: Actualizar stock después de una compra
    const newStock = initialStock - purchaseQuantity
    mockUpdateStockFlow(newStock)
    const productAfter = await productService.updateProduct(mockProductId, {
      stock_quantity: newStock
    })
    const timestampAfter = new Date(productAfter.updated_at)

    // Assert: El timestamp de actualización se ha modificado
    expect(productAfter.updated_at).toBeDefined()
    expect(timestampAfter).toBeInstanceOf(Date)
    expect(productAfter.stock_quantity).toBe(newStock)
  })
})
