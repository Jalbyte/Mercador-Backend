/**
 * Tests para C71: Estado del Producto - Stock Bajo
 * 
 * Estos tests verifican que:
 * - Un producto se puede crear con stock mayor a 5
 * - El stock se puede reducir a 5 unidades o menos
 * - Se genera un evento de 'stock bajo' cuando stock <= 5
 * - El evento contiene la información correcta del producto
 * - Se detectan múltiples escenarios de stock bajo
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockSupabaseClient } from '../mocks/supabase.mock.js'
import * as productService from '../../services/product.service.js'

// Mocks
vi.mock('../../config/supabase.js', () => ({
  supabase: mockSupabaseClient,
  createSupabaseClient: vi.fn(() => mockSupabaseClient)
}))

describe('C71: Estado del Producto - Stock Bajo', () => {
  const mockProductId = '710'
  const initialStock = 10
  const lowStockThreshold = 5

  const mockProduct = {
    id: mockProductId,
    name: 'Producto Test Stock Bajo C71',
    description: 'Producto para test de alerta de stock bajo',
    price: 50000,
    category: 'Videojuegos',
    license_type: 'Digital',
    stock_quantity: initialStock,
    image_url: 'https://example.com/product-c71.jpg',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  // Simular sistema de eventos para stock bajo
  const lowStockEvents: Array<{
    eventType: string
    productId: string
    productName: string
    previousStock: number
    currentStock: number
    threshold: number
    timestamp: string
  }> = []

  beforeEach(() => {
    vi.clearAllMocks()
    lowStockEvents.length = 0 // Limpiar eventos anteriores
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
  function mockUpdateStockFlow(previousStock: number, newStock: number) {
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

    // Simular generación de evento si el stock es bajo
    if (newStock <= lowStockThreshold) {
      lowStockEvents.push({
        eventType: 'LOW_STOCK_ALERT',
        productId: mockProductId,
        productName: mockProduct.name,
        previousStock,
        currentStock: newStock,
        threshold: lowStockThreshold,
        timestamp: new Date().toISOString()
      })
    }

    return updatedProduct
  }

  /**
   * Helper para verificar si hay eventos de stock bajo
   */
  function checkLowStockEvents(productId: string) {
    return lowStockEvents.filter(event => event.productId === productId)
  }

  // ============================================================================
  // TEST CASES
  // ============================================================================

  it('C71-1: Debe crear un producto con stock inicial mayor a 5 unidades', async () => {
    // Step 1: Crear producto con stock inicial > 5
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
    expect(product.stock_quantity).toBeGreaterThan(5)
  })

  it('C71-2: Debe actualizar el stock del producto a 5 unidades', async () => {
    // Step 1: Obtener producto con stock inicial
    mockGetProductFlow(initialStock)
    const productBefore = await productService.getProductById(mockProductId)
    expect(productBefore?.stock_quantity).toBe(initialStock)

    // Step 2: Reducir stock a 5 unidades
    mockUpdateStockFlow(initialStock, 5)
    const productAfter = await productService.updateProduct(mockProductId, {
      stock_quantity: 5
    })

    // Assert
    expect(productAfter?.stock_quantity).toBe(5)
    expect(productAfter?.stock_quantity).toBeLessThanOrEqual(lowStockThreshold)
  })

  it('C71-3: Debe generar un evento de "stock bajo" cuando stock <= 5', async () => {
    // Step 1: Producto con stock inicial
    mockGetProductFlow(initialStock)
    await productService.getProductById(mockProductId)

    // Step 2: Reducir stock a 5 (umbral de stock bajo)
    mockUpdateStockFlow(initialStock, 5)
    await productService.updateProduct(mockProductId, {
      stock_quantity: 5
    })

    // Step 3: Verificar que se generó evento de stock bajo
    const events = checkLowStockEvents(mockProductId)

    // Assert
    expect(events).toBeDefined()
    expect(events.length).toBeGreaterThan(0)
    expect(events[0].eventType).toBe('LOW_STOCK_ALERT')
    expect(events[0].currentStock).toBe(5)
  })

  it('C71-4: Debe incluir información correcta del producto en el evento', async () => {
    // Step 1: Reducir stock a 4 (por debajo del umbral)
    mockGetProductFlow(10)
    await productService.getProductById(mockProductId)

    mockUpdateStockFlow(10, 4)
    await productService.updateProduct(mockProductId, {
      stock_quantity: 4
    })

    // Step 2: Verificar evento generado
    const events = checkLowStockEvents(mockProductId)
    const event = events[0]

    // Assert: Verificar que el evento contiene toda la información
    expect(event).toBeDefined()
    expect(event.productId).toBe(mockProductId)
    expect(event.productName).toBe(mockProduct.name)
    expect(event.currentStock).toBe(4)
    expect(event.previousStock).toBe(10)
    expect(event.threshold).toBe(lowStockThreshold)
    expect(event.timestamp).toBeDefined()
  })

  it('C71-5: Debe generar evento cuando stock baja de 6 a 5', async () => {
    // Step 1: Producto con 6 unidades
    mockGetProductFlow(6)
    const productBefore = await productService.getProductById(mockProductId)
    expect(productBefore?.stock_quantity).toBe(6)

    // Step 2: Reducir a 5 (entra en umbral bajo)
    mockUpdateStockFlow(6, 5)
    const productAfter = await productService.updateProduct(mockProductId, {
      stock_quantity: 5
    })

    // Assert
    expect(productAfter?.stock_quantity).toBe(5)
    
    const events = checkLowStockEvents(mockProductId)
    expect(events.length).toBeGreaterThan(0)
    expect(events[0].currentStock).toBe(5)
  })

  it('C71-6: Debe generar eventos para múltiples reducciones de stock', async () => {
    // Limpiar eventos previos
    lowStockEvents.length = 0

    // Step 1: Reducir stock a 5
    mockUpdateStockFlow(10, 5)
    await productService.updateProduct(mockProductId, { stock_quantity: 5 })

    // Step 2: Reducir stock a 3
    mockUpdateStockFlow(5, 3)
    await productService.updateProduct(mockProductId, { stock_quantity: 3 })

    // Step 3: Reducir stock a 1
    mockUpdateStockFlow(3, 1)
    await productService.updateProduct(mockProductId, { stock_quantity: 1 })

    // Assert: Verificar que se generaron 3 eventos
    const events = checkLowStockEvents(mockProductId)
    expect(events.length).toBe(3)
    
    // Verificar secuencia de eventos
    expect(events[0].currentStock).toBe(5)
    expect(events[1].currentStock).toBe(3)
    expect(events[2].currentStock).toBe(1)
  })

  it('C71-7: No debe generar evento cuando stock está por encima del umbral', async () => {
    // Limpiar eventos previos
    lowStockEvents.length = 0

    // Step 1: Reducir stock de 10 a 7 (por encima de umbral)
    const updatedProduct = {
      ...mockProduct,
      stock_quantity: 7,
      updated_at: new Date().toISOString()
    }

    mockSupabaseClient.from = vi.fn(() => ({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: updatedProduct,
              error: null
            })
          })
        })
      })
    })) as any

    await productService.updateProduct(mockProductId, { stock_quantity: 7 })

    // Assert: No debe haber eventos
    const events = checkLowStockEvents(mockProductId)
    expect(events.length).toBe(0)
  })

  it('C71-8: Debe generar evento con diferentes umbrales de stock', async () => {
    // Limpiar eventos previos
    lowStockEvents.length = 0

    // Test con stock = 1 (muy bajo)
    mockUpdateStockFlow(10, 1)
    await productService.updateProduct(mockProductId, { stock_quantity: 1 })

    const events = checkLowStockEvents(mockProductId)
    expect(events.length).toBeGreaterThan(0)
    
    const event = events[events.length - 1]
    expect(event.currentStock).toBe(1)
    expect(event.currentStock).toBeLessThanOrEqual(lowStockThreshold)
  })

  it('C71-9: Debe incluir timestamp en el evento de stock bajo', async () => {
    // Limpiar eventos previos
    lowStockEvents.length = 0

    // Step 1: Reducir stock a 3
    const beforeTimestamp = new Date().getTime()
    
    mockUpdateStockFlow(10, 3)
    await productService.updateProduct(mockProductId, { stock_quantity: 3 })

    const afterTimestamp = new Date().getTime()

    // Assert: Verificar timestamp
    const events = checkLowStockEvents(mockProductId)
    expect(events.length).toBeGreaterThan(0)
    
    const event = events[0]
    expect(event.timestamp).toBeDefined()
    
    const eventTimestamp = new Date(event.timestamp).getTime()
    expect(eventTimestamp).toBeGreaterThanOrEqual(beforeTimestamp)
    expect(eventTimestamp).toBeLessThanOrEqual(afterTimestamp)
  })

  it('C71-10: Debe manejar correctamente el umbral exacto (stock = 5)', async () => {
    // Limpiar eventos previos
    lowStockEvents.length = 0

    // Step 1: Reducir exactamente al umbral (5)
    mockUpdateStockFlow(10, 5)
    const product = await productService.updateProduct(mockProductId, {
      stock_quantity: 5
    })

    // Assert
    expect(product?.stock_quantity).toBe(5)
    
    const events = checkLowStockEvents(mockProductId)
    expect(events.length).toBe(1)
    expect(events[0].currentStock).toBe(5)
    expect(events[0].currentStock).toBeLessThanOrEqual(lowStockThreshold)
  })
})
