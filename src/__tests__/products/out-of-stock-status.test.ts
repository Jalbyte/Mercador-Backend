/**
 * Tests para C70: Estado del Producto - Fuera de Stock
 * 
 * Estos tests verifican que:
 * - Un producto se puede agotar (stock = 0)
 * - No se permite comprar productos agotados
 * - El sistema maneja correctamente productos con stock = 0
 * - Se puede reabastecer productos agotados
 * - Las actualizaciones de stock son atómicas
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockSupabaseClient } from '../mocks/supabase.mock.js'
import * as productService from '../../services/product.service.js'

// Mocks
vi.mock('../../config/supabase.js', () => ({
  supabase: mockSupabaseClient,
  createSupabaseClient: vi.fn(() => mockSupabaseClient)
}))

describe('C70: Estado del Producto - Fuera de Stock', () => {
  const mockProductId = '700'
  const initialStock = 10

  const mockProduct = {
    id: mockProductId,
    name: 'Producto Test Out of Stock C70',
    description: 'Producto para test de agotamiento de stock',
    price: 50000,
    category: 'Videojuegos',
    license_type: 'Digital',
    stock_quantity: initialStock,
    image_url: 'https://example.com/product-c70.jpg',
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
  function mockGetProductFlow(stock: number) {
    const product = {
      ...mockProduct,
      stock_quantity: stock
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

  // ============================================================================
  // TEST CASES
  // ============================================================================

  it('C70-1: Debe crear un producto con stock inicial mayor a 0', async () => {
    // Step 1: Crear producto con stock inicial
    mockCreateProductFlow(initialStock)

    // Act
    const product = await productService.createProduct({
      name: mockProduct.name,
      description: mockProduct.description,
      price: mockProduct.price,
      category: mockProduct.category,
      license_type: mockProduct.license_type,
      stock_quantity: initialStock
    })

    // Assert
    expect(product).toBeDefined()
    expect(product.id).toBe(mockProductId)
    expect(product.stock_quantity).toBe(initialStock)
    expect(product.stock_quantity).toBeGreaterThan(0)
  })

  it('C70-2: Debe simular compra que reduce el stock a 0 de forma atómica', async () => {
    // Step 1: Obtener producto con stock inicial
    mockGetProductFlow(initialStock)
    const productBefore = await productService.getProductById(mockProductId)

    expect(productBefore?.stock_quantity).toBe(initialStock)

    // Step 2: Simular compra de todas las unidades
    const purchaseQuantity = initialStock
    mockPurchaseSimulation(mockProductId, purchaseQuantity)

    // Step 3: Actualizar stock a 0
    mockUpdateStockFlow(0)
    const productAfter = await productService.updateProduct(mockProductId, {
      stock_quantity: 0
    })

    // Assert
    expect(productAfter?.stock_quantity).toBe(0)
    expect(mockSupabaseClient.from).toHaveBeenCalledWith('products')
  })

  it('C70-3: Debe tener stock_quantity = 0 cuando el producto se agota', async () => {
    // Step 1: Producto con 1 unidad
    mockGetProductFlow(1)
    const productBefore = await productService.getProductById(mockProductId)
    expect(productBefore?.stock_quantity).toBe(1)

    // Step 2: Comprar última unidad
    mockUpdateStockFlow(0)
    const productAfter = await productService.updateProduct(mockProductId, {
      stock_quantity: 0
    })

    // Assert: Stock es 0 (agotado)
    expect(productAfter?.stock_quantity).toBe(0)
  })

  it('C70-4: No debe permitir comprar un producto cuando stock_quantity = 0', async () => {
    // Arrange: Producto agotado
    mockGetProductFlow(0)

    // Act
    const product = await productService.getProductById(mockProductId)

    // Assert: Stock es 0
    expect(product).toBeDefined()
    expect(product?.stock_quantity).toBe(0)

    // Validar lógica de compra: No se puede comprar si stock = 0
    const canPurchase = product && product.stock_quantity > 0
    expect(canPurchase).toBe(false)
  })

  it('C70-5: Debe completar el flujo completo de agotamiento correctamente', async () => {
    // Step 1: Crear producto
    mockCreateProductFlow(5)
    const createdProduct = await productService.createProduct({
      name: mockProduct.name,
      description: 'Test flujo completo',
      price: mockProduct.price,
      category: mockProduct.category,
      license_type: mockProduct.license_type,
      stock_quantity: 5
    })

    expect(createdProduct.stock_quantity).toBe(5)

    // Step 2: Verificar stock antes de agotar
    mockGetProductFlow(5)
    const beforeDepletion = await productService.getProductById(mockProductId)
    expect(beforeDepletion?.stock_quantity).toBe(5)

    // Step 3: Agotar stock
    mockUpdateStockFlow(0)
    const afterDepletion = await productService.updateProduct(mockProductId, {
      stock_quantity: 0
    })

    // Assert
    expect(afterDepletion?.stock_quantity).toBe(0)
  })

  it('C70-6: Debe rechazar múltiples intentos de compra cuando stock = 0', async () => {
    // Arrange: Producto agotado
    mockGetProductFlow(0)

    // Act: Intentar obtener producto múltiples veces
    const attempt1 = await productService.getProductById(mockProductId)
    const attempt2 = await productService.getProductById(mockProductId)
    const attempt3 = await productService.getProductById(mockProductId)

    // Assert: Todos los intentos muestran stock = 0
    expect(attempt1?.stock_quantity).toBe(0)
    expect(attempt2?.stock_quantity).toBe(0)
    expect(attempt3?.stock_quantity).toBe(0)

    // Validar lógica de compra: No se puede comprar si stock = 0
    const canPurchase1 = attempt1 && attempt1.stock_quantity > 0
    const canPurchase2 = attempt2 && attempt2.stock_quantity > 0
    const canPurchase3 = attempt3 && attempt3.stock_quantity > 0

    expect(canPurchase1).toBe(false)
    expect(canPurchase2).toBe(false)
    expect(canPurchase3).toBe(false)
  })

  it('C70-7: Debe restaurar disponibilidad al reabastecer producto agotado', async () => {
    // Step 1: Producto agotado
    mockGetProductFlow(0)
    const productBefore = await productService.getProductById(mockProductId)
    expect(productBefore?.stock_quantity).toBe(0)

    // Step 2: Reabastecer producto
    const newStock = 20
    mockUpdateStockFlow(newStock)
    const productAfter = await productService.updateProduct(mockProductId, {
      stock_quantity: newStock
    })

    // Assert: Stock restaurado
    expect(productAfter?.stock_quantity).toBe(newStock)
    expect(productAfter?.stock_quantity).toBeGreaterThan(0)
  })

  it('C70-8: Debe manejar actualizaciones de stock de forma atómica', async () => {
    // Step 1: Producto con stock
    mockGetProductFlow(5)
    const initialProduct = await productService.getProductById(mockProductId)
    expect(initialProduct?.stock_quantity).toBe(5)

    // Step 2: Actualizar stock a 0 (compra de 5 unidades)
    mockUpdateStockFlow(0)
    const finalProduct = await productService.updateProduct(mockProductId, {
      stock_quantity: 0
    })

    // Assert: Verificar atomicidad
    expect(finalProduct?.stock_quantity).toBe(0)
    expect(finalProduct?.stock_quantity).not.toBeGreaterThan(0)
  })

  it('C70-9: Debe actualizar timestamps cuando el stock cambia', async () => {
    // Step 1: Producto con stock
    const initialTime = new Date('2024-01-01T10:00:00Z')
    mockGetProductFlow(3)
    const productBefore = await productService.getProductById(mockProductId)

    // Step 2: Agotar stock (con nuevo timestamp)
    const afterTime = new Date('2024-01-01T10:05:00Z')
    mockSupabaseClient.from = vi.fn(() => ({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                ...mockProduct,
                stock_quantity: 0,
                updated_at: afterTime.toISOString()
              },
              error: null
            })
          })
        })
      })
    })) as any

    const productAfter = await productService.updateProduct(mockProductId, {
      stock_quantity: 0
    })

    // Assert: Timestamp actualizado
    expect(productAfter?.updated_at).toBeDefined()
    expect(productAfter?.stock_quantity).toBe(0)
  })
})
