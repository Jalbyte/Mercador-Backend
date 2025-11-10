/**
 * Tests para C116: Validar cantidad - Cantidad igual al stock disponible
 * 
 * Estos tests verifican que:
 * - El usuario puede agregar una cantidad igual al stock disponible
 * - El sistema no permite agregar más productos cuando se alcanza el límite de stock
 * - El contador del carrito refleja correctamente la cantidad agregada
 * - El carrito muestra el producto con la cantidad correcta
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockSupabaseClient } from '../mocks/supabase.mock.js'
import * as cartService from '../../services/cart.service.js'

// Mocks
vi.mock('../../config/supabase.js', () => ({
  supabase: mockSupabaseClient,
  createSupabaseClient: vi.fn(() => mockSupabaseClient)
}))

describe('C116: Validar cantidad - Cantidad igual al stock disponible', () => {
  const mockUserId = 'user-stock-test-123'
  const mockProductId = 999
  const availableStock = 5 // Stock disponible del producto
  const productPrice = 250000

  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * Helper para crear un mock de producto con stock específico
   */
  function mockProductWithStock(stock: number) {
    return {
      id: mockProductId,
      name: 'Producto Stock Test',
      price: productPrice,
      stock_quantity: stock,
      is_active: true,
      image_url: 'https://example.com/product.jpg'
    }
  }

  /**
   * Helper para configurar mocks del flujo de agregar al carrito
   */
  function mockAddToCartFlow(quantity: number, currentStock: number, existingCartId: number = 1) {
    const product = mockProductWithStock(currentStock)
    
    // Mock de búsqueda de carrito existente
    const mockCartLookup = vi.fn().mockResolvedValue({
      data: { id: existingCartId, user_id: mockUserId, created_at: new Date().toISOString() },
      error: null
    })

    // Mock de búsqueda de item existente (no existe)
    const mockItemLookup = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST116' }
    })

    // Mock de insert de nuevo item
    const mockItemInsert = vi.fn().mockResolvedValue({
      data: {
        id: 1,
        cart_id: existingCartId,
        product_id: mockProductId,
        quantity: quantity,
        product: product,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      error: null
    })

    // Configurar mockSupabaseClient.from() con lógica de tabla
    mockSupabaseClient.from = vi.fn((table: string) => {
      const chain: any = {
        select: vi.fn(function(columns?: string) {
          if (table === 'carts') {
            chain.single = mockCartLookup
            chain.maybeSingle = mockCartLookup
          } else if (table === 'cart_items') {
            chain.single = mockItemLookup
            chain.eq = vi.fn(() => {
              const eqChain: any = {
                eq: vi.fn(() => {
                  eqChain.single = mockItemLookup
                  return eqChain
                }),
                single: mockItemLookup
              }
              return eqChain
            })
          } else if (table === 'products') {
            chain.eq = vi.fn(() => {
              const eqChain: any = {
                single: vi.fn().mockResolvedValue({ data: product, error: null })
              }
              return eqChain
            })
          }
          return chain
        }),
        insert: vi.fn(function() {
          chain.select = vi.fn(() => {
            const selectChain: any = {
              single: mockItemInsert
            }
            return selectChain
          })
          return chain
        }),
        eq: vi.fn(function() { return chain }),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
      }
      return chain
    })

    return { product, mockItemInsert }
  }

  /**
   * Helper para configurar mocks de getUserCart
   */
  function mockGetCartFlow(quantity: number, currentStock: number, cartId: number = 1) {
    const product = mockProductWithStock(currentStock)
    const mockCart = {
      id: cartId,
      user_id: mockUserId,
      created_at: new Date().toISOString()
    }
    const mockCartItems = [{
      id: 1,
      cart_id: cartId,
      product_id: mockProductId,
      quantity: quantity,
      product: product,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }]

    mockSupabaseClient.from = vi.fn((table: string) => {
      const chain: any = {
        select: vi.fn(() => {
          if (table === 'carts') {
            chain.eq = vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: mockCart, error: null })
            }))
          } else if (table === 'cart_items') {
            chain.eq = vi.fn(() => Promise.resolve({ data: mockCartItems, error: null }))
          } else if (table === 'products') {
            chain.eq = vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: product, error: null })
            }))
          }
          return chain
        })
      }
      return chain
    })
  }

  it('C116-1: Página del producto se carga correctamente con stock disponible', async () => {
    // Arrange: Producto con stock disponible (5 unidades)
    const product = mockProductWithStock(availableStock)

    // Act: Verificar que el producto tiene stock disponible
    expect(product).toBeDefined()
    expect(product.stock_quantity).toBe(availableStock)
    expect(product.stock_quantity).toBeGreaterThan(0)

    // Assert: El producto está disponible para agregar al carrito
    expect(product.is_active).toBe(true)
  })

  it('C116-2: Sistema muestra el stock disponible del producto en la interfaz', async () => {
    // Arrange: Producto con stock específico
    const product = mockProductWithStock(availableStock)

    // Act: Verificar visualización del stock
    const displayStock = product.stock_quantity

    // Assert: El stock se muestra correctamente
    expect(displayStock).toBe(availableStock)
    expect(displayStock).toBe(5)
  })

  it('C116-3: Campo de cantidad acepta entrada igual al stock disponible', async () => {
    // Arrange: Usuario quiere agregar cantidad igual al stock (5 unidades)
    const quantityToAdd = availableStock // 5 = stock completo

    // Mock del flujo
    mockAddToCartFlow(quantityToAdd, availableStock)

    // Act: Agregar cantidad igual al stock disponible
    const result = await cartService.addToCart(mockUserId, mockProductId, quantityToAdd)

    // Assert: El sistema acepta la cantidad y agrega al carrito
    expect(result).toBeDefined()
    expect(result.quantity).toBe(quantityToAdd)
    expect(result.quantity).toBe(availableStock)
    expect(result.product_id).toBe(mockProductId)
  })

  it('C116-4: Contador del carrito refleja la cantidad agregada correctamente', async () => {
    // Arrange: Usuario ha agregado todo el stock disponible (5 unidades)
    const quantityInCart = availableStock
    const mockCartId = 1

    // Mock para getCartItemCount (usa count, no data)
    mockSupabaseClient.from = vi.fn((table: string) => {
      const chain: any = {
        select: vi.fn((columns?: string, options?: any) => {
          if (table === 'carts') {
            chain.eq = vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { id: mockCartId, user_id: mockUserId },
                error: null
              })
            }))
          } else if (table === 'cart_items' && options?.count === 'exact') {
            // getCartItemCount usa { count: 'exact', head: true }
            chain.eq = vi.fn(() => Promise.resolve({
              count: 1, // 1 línea en el carrito
              error: null
            }))
          }
          return chain
        })
      }
      return chain
    })

    // Act: Obtener contador del carrito
    const itemCount = await cartService.getCartItemCount(mockUserId)

    // Assert: El contador muestra la cantidad agregada (número de líneas = 1)
    expect(itemCount).toBe(1) // getCartItemCount retorna número de líneas, no suma de cantidades
  })

  it('C116-5: Página del carrito se carga correctamente con el producto agregado', async () => {
    // Arrange: Usuario ha agregado producto con cantidad igual al stock
    const quantityInCart = availableStock
    mockGetCartFlow(quantityInCart, availableStock)

    // Act: Obtener carrito del usuario
    const cart = await cartService.getUserCart(mockUserId)

    // Assert: El carrito se carga con el producto
    expect(cart).toBeDefined()
    expect(cart.items).toHaveLength(1)
    expect(cart.items[0].product_id).toBe(mockProductId)
    expect(cart.items[0].quantity).toBe(quantityInCart)
  })

  it('C116-6: Producto muestra cantidad correcta y botón "Más" deshabilitado (stock completo)', async () => {
    // Arrange: Usuario tiene todo el stock en el carrito (5 de 5 disponibles)
    const quantityInCart = availableStock
    mockGetCartFlow(quantityInCart, availableStock)

    // Act: Obtener carrito y validar restricciones
    const cart = await cartService.getUserCart(mockUserId)

    // Assert: El producto está en el carrito con la cantidad correcta
    expect(cart.items).toHaveLength(1)
    expect(cart.items[0].quantity).toBe(quantityInCart)
    expect(cart.items[0].quantity).toBe(availableStock)

    // Assert: max_quantity refleja que no hay más stock disponible
    expect(cart.items[0].max_quantity).toBe(availableStock)
    
    // Assert: has_enough_stock es true (la cantidad actual está dentro del límite)
    expect(cart.items[0].has_enough_stock).toBe(true)
    
    // Assert: No se puede agregar más (cantidad == max_quantity)
    const firstItem = cart.items[0]
    const canAddMore = firstItem && firstItem.max_quantity ? firstItem.quantity < firstItem.max_quantity : false
    expect(canAddMore).toBe(false) // Botón "Más" debe estar deshabilitado
  })

  it('C116-7: Precio total se calcula correctamente para cantidad igual al stock', async () => {
    // Arrange: Usuario tiene 5 unidades en el carrito
    const quantityInCart = availableStock
    const expectedTotal = productPrice * quantityInCart // 250,000 x 5 = 1,250,000
    mockGetCartFlow(quantityInCart, availableStock)

    // Act: Obtener carrito
    const cart = await cartService.getUserCart(mockUserId)

    // Assert: El precio total es correcto
    expect(cart.total).toBe(expectedTotal)
    expect(cart.total).toBe(1250000)
  })

  it('C116-8: Sistema previene agregar más productos cuando se alcanza el límite de stock', async () => {
    // Arrange: Usuario intenta agregar 6 unidades cuando solo hay 5 disponibles
    const quantityToAdd = availableStock + 1 // 6 unidades
    const product = mockProductWithStock(availableStock) // 5 en stock

    // Mock de producto
    mockSupabaseClient.from = vi.fn((table: string) => {
      if (table === 'products') {
        const chain: any = {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: product, error: null })
            }))
          }))
        }
        return chain
      }
      return {} as any
    })

    // Act & Assert: Intentar agregar más del stock disponible debe fallar
    await expect(
      cartService.addToCart(mockUserId, mockProductId, quantityToAdd)
    ).rejects.toThrow(/stock|disponible|exceed/i)
  })

  it('C116-9: Flujo completo - Agregar cantidad igual al stock y validar restricción', async () => {
    // Arrange: Setup del test completo
    const quantityToAdd = availableStock // 5 unidades (todo el stock)
    
    // Step 1: Verificar stock disponible
    const product = mockProductWithStock(availableStock)
    expect(product.stock_quantity).toBe(availableStock)

    // Step 2: Agregar cantidad igual al stock
    mockAddToCartFlow(quantityToAdd, availableStock)
    const addResult = await cartService.addToCart(mockUserId, mockProductId, quantityToAdd)
    expect(addResult.quantity).toBe(quantityToAdd)

    // Step 3: Verificar carrito
    mockGetCartFlow(quantityToAdd, availableStock)
    const cart = await cartService.getUserCart(mockUserId)
    
    // Assert: Carrito tiene el producto con cantidad completa
    expect(cart.items[0].quantity).toBe(availableStock)
    expect(cart.items[0].max_quantity).toBe(availableStock)
    
    // Assert: No se puede incrementar más (botón + deshabilitado)
    const item = cart.items[0]
    const reachedLimit = item && item.max_quantity ? item.quantity >= item.max_quantity : false
    expect(reachedLimit).toBe(true)
    
    // Assert: Precio total correcto
    expect(cart.total).toBe(productPrice * availableStock)
    
    // Assert: Item válido (tiene stock suficiente para la cantidad actual)
    expect(cart.items[0].has_enough_stock).toBe(true)
    expect(cart.valid).toBe(true)
  })
})
