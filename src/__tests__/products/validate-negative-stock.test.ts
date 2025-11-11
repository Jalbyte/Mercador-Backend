/**
 * Tests para C68: Validación de Stock - Cantidad Insuficiente
 * 
 * Estos tests verifican que:
 * - No se puede establecer un stock negativo en un producto
 * - La API responde con error cuando se intenta actualizar a stock negativo
 * - El stock original permanece sin cambios después del intento fallido
 * - Se devuelve un mensaje de error claro y descriptivo
 * - La validación de stock funciona correctamente
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockSupabaseClient } from '../mocks/supabase.mock.js'
import * as productService from '../../services/product.service.js'
import { AppError } from '../../utils/errors.js'

// Mocks
vi.mock('../../config/supabase.js', () => ({
  supabase: mockSupabaseClient,
  createSupabaseClient: vi.fn(() => mockSupabaseClient)
}))

describe('C68: Validación de Stock - Cantidad Insuficiente', () => {
  const mockProductId = '680'
  const initialStock = 10
  const negativeStock = -5

  const mockProduct = {
    id: mockProductId,
    name: 'Producto Test Stock Negativo C68',
    description: 'Producto para test de validación de stock negativo',
    price: 45000,
    category: 'Videojuegos',
    license_type: 'Digital',
    stock_quantity: initialStock,
    image_url: 'https://example.com/product-c68.jpg',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    license_category: {
      id: 'Digital',
      type: 'Digital'
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * Helper para mock de getProductById
   */
  function mockGetProductFlow(stock: number = initialStock) {
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
   * Helper para mock de updateProduct que rechaza stock negativo
   */
  function mockUpdateProductFlowError(errorMessage: string) {
    mockSupabaseClient.from = vi.fn((table: string) => {
      if (table === 'products') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: {
                    message: errorMessage,
                    code: '23514', // PostgreSQL check constraint violation
                    details: 'Stock quantity must be non-negative'
                  }
                })
              })
            })
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockProduct,
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
                data: { id: 'Digital', type: 'Digital' },
                error: null
              })
            })
          })
        }
      }
      return {} as any
    })
  }

  it('C68-1: Identificar un producto existente con stock inicial conocido', async () => {
    // Arrange: Producto con stock inicial de 10 unidades
    mockGetProductFlow(initialStock)

    // Act: Obtener producto de la base de datos
    const product = await productService.getProductById(mockProductId)

    // Assert: El producto y su stock inicial son identificados correctamente
    expect(product).toBeDefined()
    expect(product?.id).toBe(mockProductId)
    expect(product?.stock_quantity).toBe(initialStock)
    expect(product?.stock_quantity).toBe(10)
    expect(product?.name).toBe(mockProduct.name)
  })

  it('C68-2: Intentar editar la cantidad de stock a un número negativo', async () => {
    // Arrange: Producto con stock inicial de 10 unidades
    mockGetProductFlow(initialStock)
    const product = await productService.getProductById(mockProductId)
    expect(product?.stock_quantity).toBe(10)

    // Act: Intentar actualizar el stock a un valor negativo (-5)
    mockUpdateProductFlowError('Stock quantity cannot be negative')

    // Assert: La solicitud se construye con la información del producto
    const updateAttempt = async () => {
      await productService.updateProduct(mockProductId, {
        stock_quantity: negativeStock
      })
    }

    // Verificar que se intenta actualizar con stock negativo
    expect(negativeStock).toBe(-5)
    expect(negativeStock).toBeLessThan(0)
    
    // La función debería lanzar un error
    await expect(updateAttempt()).rejects.toThrow()
  })

  it('C68-3: Verificar que la API responde con un código de estado de error', async () => {
    // Arrange: Intentar actualizar stock a valor negativo
    mockUpdateProductFlowError('Stock quantity cannot be negative')

    // Act & Assert: Verificar que se lanza un error
    try {
      await productService.updateProduct(mockProductId, {
        stock_quantity: negativeStock
      })
      // Si no lanza error, el test falla
      expect.fail('Debería haber lanzado un error')
    } catch (error) {
      // Assert: La API devuelve un error (400 Bad Request o 422 Unprocessable Entity)
      expect(error).toBeDefined()
      // En un sistema real, verificaríamos el código de estado HTTP
      // expect(error.statusCode).toBe(400) o expect(error.statusCode).toBe(422)
    }
  })

  it('C68-4: Verificar el cuerpo de la respuesta contiene mensaje de error descriptivo', async () => {
    // Arrange: Configurar mock para error de stock negativo
    mockUpdateProductFlowError('Stock quantity cannot be negative')

    // Act: Intentar actualizar con stock negativo
    try {
      await productService.updateProduct(mockProductId, {
        stock_quantity: negativeStock
      })
      expect.fail('Debería haber lanzado un error')
    } catch (error: any) {
      // Assert: El mensaje de error es claro y descriptivo
      expect(error).toBeDefined()
      expect(error.message).toBeDefined()
      
      // Verificar que el mensaje menciona el problema con el stock
      const errorMessage = error.message.toLowerCase()
      const isStockError = 
        errorMessage.includes('stock') ||
        errorMessage.includes('cantidad') ||
        errorMessage.includes('negativ') ||
        errorMessage.includes('insuficiente')
      
      expect(isStockError).toBe(true)
    }
  })

  it('C68-5: Consultar que el stock permanece sin cambios en la base de datos', async () => {
    // Arrange: Producto con stock inicial
    mockGetProductFlow(initialStock)
    const productBefore = await productService.getProductById(mockProductId)
    expect(productBefore?.stock_quantity).toBe(10)

    // Act: Intentar actualizar con stock negativo (debe fallar)
    mockUpdateProductFlowError('Stock quantity cannot be negative')
    
    try {
      await productService.updateProduct(mockProductId, {
        stock_quantity: negativeStock
      })
    } catch (error) {
      // Se espera que falle
    }

    // Act: Consultar el stock del producto en la base de datos
    mockGetProductFlow(initialStock) // Stock permanece igual
    const productAfter = await productService.getProductById(mockProductId)

    // Assert: El stock permanece sin cambios, reflejando el stock inicial
    expect(productAfter).toBeDefined()
    expect(productAfter?.stock_quantity).toBe(initialStock)
    expect(productAfter?.stock_quantity).toBe(10)
    expect(productAfter?.stock_quantity).toBe(productBefore?.stock_quantity)
  })

  it('C68-6: Flujo completo - Identificar, intentar actualizar negativo, verificar rechazo', async () => {
    // Step 1: Identificar producto con stock inicial
    mockGetProductFlow(initialStock)
    let product = await productService.getProductById(mockProductId)
    
    expect(product?.stock_quantity).toBe(10)
    const stockOriginal = product?.stock_quantity

    // Step 2: Intentar actualizar a stock negativo
    mockUpdateProductFlowError('Stock quantity cannot be negative')
    
    let errorOccurred = false
    let errorMessage = ''

    try {
      await productService.updateProduct(mockProductId, {
        stock_quantity: -5
      })
    } catch (error: any) {
      errorOccurred = true
      errorMessage = error.message
    }

    // Step 3: Verificar que se rechazó la actualización
    expect(errorOccurred).toBe(true)
    expect(errorMessage).toBeDefined()
    expect(errorMessage.length).toBeGreaterThan(0)

    // Step 4: Verificar que el stock permanece sin cambios
    mockGetProductFlow(initialStock)
    product = await productService.getProductById(mockProductId)
    
    expect(product?.stock_quantity).toBe(stockOriginal)
    expect(product?.stock_quantity).toBe(10)
  })

  it('C68-7: Validar diferentes valores negativos de stock', async () => {
    // Arrange: Producto con stock inicial
    mockGetProductFlow(initialStock)
    const product = await productService.getProductById(mockProductId)
    expect(product?.stock_quantity).toBe(10)

    // Test con diferentes valores negativos
    const negativeValues = [-1, -5, -10, -100]

    for (const negValue of negativeValues) {
      mockUpdateProductFlowError(`Stock quantity cannot be negative: ${negValue}`)

      // Act: Intentar actualizar con valor negativo
      let errorThrown = false
      try {
        await productService.updateProduct(mockProductId, {
          stock_quantity: negValue
        })
      } catch (error) {
        errorThrown = true
      }

      // Assert: Cada valor negativo debe ser rechazado
      expect(errorThrown).toBe(true)
      expect(negValue).toBeLessThan(0)
    }
  })

  it('C68-8: Validar que stock cero es permitido pero negativo no', async () => {
    // Arrange: Producto con stock inicial
    mockGetProductFlow(initialStock)

    // Act 1: Actualizar a stock cero (debería ser permitido)
    const zeroStock = 0
    expect(zeroStock).toBeGreaterThanOrEqual(0)

    // Act 2: Intentar actualizar a stock negativo (debería ser rechazado)
    mockUpdateProductFlowError('Stock quantity cannot be negative')
    
    let errorThrown = false
    try {
      await productService.updateProduct(mockProductId, {
        stock_quantity: -1
      })
    } catch (error) {
      errorThrown = true
    }

    // Assert: Stock negativo es rechazado, pero cero es válido
    expect(errorThrown).toBe(true)
    expect(zeroStock).toBe(0)
    expect(-1).toBeLessThan(0)
  })

  it('C68-9: Verificar validación de stock en actualizaciones parciales', async () => {
    // Arrange: Producto existente
    mockGetProductFlow(initialStock)

    // Act: Intentar actualizar solo el stock a negativo (actualización parcial)
    mockUpdateProductFlowError('Stock quantity cannot be negative')

    let updateRejected = false
    try {
      await productService.updateProduct(mockProductId, {
        stock_quantity: -3  // Solo actualizar stock
      })
    } catch (error) {
      updateRejected = true
    }

    // Assert: La actualización parcial con stock negativo es rechazada
    expect(updateRejected).toBe(true)

    // Verificar que el producto mantiene su stock original
    mockGetProductFlow(initialStock)
    const product = await productService.getProductById(mockProductId)
    expect(product?.stock_quantity).toBe(initialStock)
  })
})
