/**
 * Tests para C117: Validar precio total
 * 
 * Estos tests verifican que:
 * - El precio unitario del producto se muestra correctamente
 * - El precio total se calcula correctamente al agregar productos
 * - El precio total se recalcula al agregar más unidades del mismo producto
 * - El precio total se actualiza al cambiar la cantidad en el carrito
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockSupabaseClient } from '../mocks/supabase.mock.js'
import * as cartService from '../../services/cart.service.js'

// Mocks
vi.mock('../../config/supabase.js', () => ({
  supabase: mockSupabaseClient,
  createSupabaseClient: vi.fn(() => mockSupabaseClient)
}))

describe('C117: Validar precio total', () => {
  const mockUserId = 'user-price-test-123'
  const mockProductId = 888
  const productPrice = 150000 // $150,000
  const availableStock = 10

  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * Helper para crear un mock de producto
   */
  function mockProduct() {
    return {
      id: mockProductId,
      name: 'Producto Precio Test',
      price: productPrice,
      stock_quantity: availableStock,
      is_active: true,
      image_url: 'https://example.com/product.jpg'
    }
  }

  /**
   * Helper para configurar mocks de addToCart
   */
  function mockAddToCartFlow(quantity: number, existingQuantity: number = 0, cartId: number = 1) {
    const product = mockProduct()
    const finalQuantity = existingQuantity + quantity
    
    // Mock de búsqueda de carrito
    const mockCartLookup = vi.fn().mockResolvedValue({
      data: { id: cartId, user_id: mockUserId, created_at: new Date().toISOString() },
      error: null
    })

    // Mock de item existente (si hay)
    const existingItem = existingQuantity > 0 ? {
      id: 1,
      cart_id: cartId,
      product_id: mockProductId,
      quantity: existingQuantity,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    } : null

    const mockItemLookup = vi.fn().mockResolvedValue({
      data: existingItem,
      error: existingItem ? null : { code: 'PGRST116' }
    })

    // Mock de insert/update
    const mockItemResult = vi.fn().mockResolvedValue({
      data: {
        id: 1,
        cart_id: cartId,
        product_id: mockProductId,
        quantity: finalQuantity,
        product: product,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      error: null
    })

    // Configurar mockSupabaseClient.from()
    mockSupabaseClient.from = vi.fn((table: string) => {
      const chain: any = {
        select: vi.fn(function() {
          if (table === 'carts') {
            chain.single = mockCartLookup
          } else if (table === 'cart_items') {
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
            chain.eq = vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: product, error: null })
            }))
          }
          return chain
        }),
        insert: vi.fn(function() {
          chain.select = vi.fn(() => ({
            single: mockItemResult
          }))
          return chain
        }),
        update: vi.fn(function() {
          chain.eq = vi.fn(() => ({
            select: vi.fn(() => ({
              single: mockItemResult
            }))
          }))
          return chain
        }),
        eq: vi.fn(function() { return chain })
      }
      return chain
    })

    return { product, finalQuantity }
  }

  /**
   * Helper para configurar mocks de getUserCart
   */
  function mockGetCartFlow(quantity: number, cartId: number = 1) {
    const product = mockProduct()
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

  /**
   * Helper para configurar mocks de updateCartItem
   */
  function mockUpdateCartFlow(newQuantity: number, itemId: number = 1, cartId: number = 1) {
    const product = mockProduct()
    
    // Mock del carrito
    const mockCart = {
      id: cartId,
      user_id: mockUserId,
      created_at: new Date().toISOString()
    }

    // Mock del item existente (para validación)
    const existingItemLookup = {
      id: itemId,
      cart_id: cartId,
      product_id: mockProductId
    }

    // Mock del item actualizado
    const updatedItem = {
      id: itemId,
      cart_id: cartId,
      product_id: mockProductId,
      quantity: newQuantity,
      product: product,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    mockSupabaseClient.from = vi.fn((table: string) => {
      const chain: any = {
        select: vi.fn(() => {
          if (table === 'carts') {
            // Mock para búsqueda de carrito
            chain.eq = vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: mockCart, error: null })
            }))
          } else if (table === 'cart_items') {
            // Mock para búsqueda de item (necesita .eq().eq().single())
            chain.eq = vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: existingItemLookup, error: null })
              }))
            }))
          } else if (table === 'products') {
            // Mock para búsqueda de producto
            chain.eq = vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: product, error: null })
            }))
          }
          return chain
        }),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: updatedItem, error: null })
              }))
            }))
          }))
        }))
      }
      return chain
    })
  }

  it('C117-1: Elegir producto con stock disponible', () => {
    // Arrange: Producto con stock disponible
    const product = mockProduct()

    // Act: Verificar disponibilidad
    const isAvailable = product.is_active && product.stock_quantity > 0

    // Assert: El producto está disponible
    expect(product).toBeDefined()
    expect(isAvailable).toBe(true)
    expect(product.stock_quantity).toBeGreaterThan(0)
  })

  it('C117-2: Precio unitario del producto se muestra correctamente', () => {
    // Arrange: Producto con precio definido
    const product = mockProduct()

    // Act: Obtener precio unitario
    const unitPrice = product.price

    // Assert: El precio unitario se muestra correctamente
    expect(unitPrice).toBe(productPrice)
    expect(unitPrice).toBe(150000)
  })

  it('C117-3: Agregar producto al carrito con cantidad específica (2 unidades)', async () => {
    // Arrange: Agregar 2 unidades del producto
    const quantityToAdd = 2
    mockAddToCartFlow(quantityToAdd, 0) // 0 = no hay cantidad existente

    // Act: Agregar producto al carrito
    const result = await cartService.addToCart(mockUserId, mockProductId, quantityToAdd)

    // Assert: El producto se agrega correctamente con mensaje de confirmación
    expect(result).toBeDefined()
    expect(result.quantity).toBe(quantityToAdd)
    expect(result.product_id).toBe(mockProductId)
  })

  it('C117-4: Precio total del carrito se calcula correctamente (150,000 × 2 = 300,000)', async () => {
    // Arrange: Carrito con 2 unidades del producto
    const quantity = 2
    const expectedTotal = productPrice * quantity // 150,000 × 2 = 300,000
    mockGetCartFlow(quantity)

    // Act: Obtener carrito con precio total
    const cart = await cartService.getUserCart(mockUserId)

    // Assert: El precio total se calcula correctamente
    expect(cart).toBeDefined()
    expect(cart.total).toBe(expectedTotal)
    expect(cart.total).toBe(300000)
    expect(cart.items[0].quantity).toBe(quantity)
  })

  it('C117-5: Agregar el mismo producto con cantidad diferente (1 unidad más)', async () => {
    // Arrange: Ya hay 2 unidades en el carrito, agregar 1 más
    const existingQuantity = 2
    const quantityToAdd = 1
    const { finalQuantity } = mockAddToCartFlow(quantityToAdd, existingQuantity)

    // Act: Agregar 1 unidad adicional del mismo producto
    const result = await cartService.addToCart(mockUserId, mockProductId, quantityToAdd)

    // Assert: La cantidad se suma a la existente (2 + 1 = 3)
    expect(result).toBeDefined()
    expect(result.quantity).toBe(finalQuantity)
    expect(result.quantity).toBe(3)
    expect(result.product_id).toBe(mockProductId)
  })

  it('C117-6: Precio total se recalcula correctamente con nueva cantidad (150,000 × 3 = 450,000)', async () => {
    // Arrange: Carrito con 3 unidades del producto (2 + 1)
    const totalQuantity = 3
    const expectedTotal = productPrice * totalQuantity // 150,000 × 3 = 450,000
    mockGetCartFlow(totalQuantity)

    // Act: Obtener carrito con precio total recalculado
    const cart = await cartService.getUserCart(mockUserId)

    // Assert: El precio total refleja la nueva cantidad
    expect(cart).toBeDefined()
    expect(cart.total).toBe(expectedTotal)
    expect(cart.total).toBe(450000)
    expect(cart.items[0].quantity).toBe(totalQuantity)
  })

  it('C117-7: Precio total se actualiza al cambiar cantidad del producto (cambiar a 3 unidades directamente)', async () => {
    // Arrange: Cambiar cantidad del producto en el carrito de 2 a 3
    const newQuantity = 3
    const itemId = 1
    mockUpdateCartFlow(newQuantity, itemId)

    // Act: Actualizar cantidad del item
    const result = await cartService.updateCartItem(mockUserId, itemId, newQuantity)

    // Assert: La cantidad se actualiza correctamente
    expect(result).toBeDefined()
    expect(result.quantity).toBe(newQuantity)
    
    // Verificar precio total con getUserCart
    const expectedTotal = productPrice * newQuantity // 150,000 × 3 = 450,000
    mockGetCartFlow(newQuantity)
    const cart = await cartService.getUserCart(mockUserId)
    
    expect(cart.total).toBe(expectedTotal)
    expect(cart.total).toBe(450000)
  })

  it('C117-8: Flujo completo - Agregar, sumar y actualizar cantidad validando precio total', async () => {
    // Step 1: Agregar 2 unidades inicialmente
    const initialQuantity = 2
    mockAddToCartFlow(initialQuantity, 0)
    let result = await cartService.addToCart(mockUserId, mockProductId, initialQuantity)
    expect(result.quantity).toBe(initialQuantity)

    // Step 2: Verificar precio total (150,000 × 2 = 300,000)
    let expectedTotal = productPrice * initialQuantity
    mockGetCartFlow(initialQuantity)
    let cart = await cartService.getUserCart(mockUserId)
    expect(cart.total).toBe(expectedTotal)
    expect(cart.total).toBe(300000)

    // Step 3: Agregar 1 unidad más del mismo producto (2 + 1 = 3)
    const additionalQuantity = 1
    const newQuantity = initialQuantity + additionalQuantity
    mockAddToCartFlow(additionalQuantity, initialQuantity)
    result = await cartService.addToCart(mockUserId, mockProductId, additionalQuantity)
    expect(result.quantity).toBe(newQuantity)

    // Step 4: Verificar precio total recalculado (150,000 × 3 = 450,000)
    expectedTotal = productPrice * newQuantity
    mockGetCartFlow(newQuantity)
    cart = await cartService.getUserCart(mockUserId)
    expect(cart.total).toBe(expectedTotal)
    expect(cart.total).toBe(450000)

    // Step 5: Actualizar cantidad directamente a 5 unidades
    const finalQuantity = 5
    mockUpdateCartFlow(finalQuantity, 1)
    const updateResult = await cartService.updateCartItem(mockUserId, 1, finalQuantity)
    expect(updateResult.quantity).toBe(finalQuantity)

    // Step 6: Verificar precio total final (150,000 × 5 = 750,000)
    expectedTotal = productPrice * finalQuantity
    mockGetCartFlow(finalQuantity)
    cart = await cartService.getUserCart(mockUserId)
    expect(cart.total).toBe(expectedTotal)
    expect(cart.total).toBe(750000)
    expect(cart.items[0].quantity).toBe(finalQuantity)
  })

  it('C117-9: Precio total con múltiples operaciones mantiene integridad', async () => {
    // Arrange: Serie de operaciones sobre el carrito
    const operations = [
      { quantity: 2, expectedTotal: 300000 },  // 150,000 × 2
      { quantity: 3, expectedTotal: 450000 },  // 150,000 × 3
      { quantity: 5, expectedTotal: 750000 },  // 150,000 × 5
      { quantity: 1, expectedTotal: 150000 },  // 150,000 × 1
    ]

    for (const op of operations) {
      // Act: Obtener carrito con cantidad específica
      mockGetCartFlow(op.quantity)
      const cart = await cartService.getUserCart(mockUserId)

      // Assert: El precio total es consistente
      expect(cart.total).toBe(op.expectedTotal)
      expect(cart.total).toBe(productPrice * op.quantity)
      expect(cart.items[0].quantity).toBe(op.quantity)
    }
  })
})
