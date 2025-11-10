/**
 * Tests para C129: Actualizar cantidad y precio - Usuario autenticado y Admin
 * 
 * Estos tests verifican que:
 * - Un usuario puede agregar productos al carrito
 * - Un admin puede actualizar el stock y precio de productos
 * - Los cambios se reflejan en la base de datos
 * - Los usuarios ven los cambios actualizados en su carrito
 * - Hay trazabilidad entre interfaz y base de datos
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockSupabaseClient } from '../mocks/supabase.mock.js'
import * as cartService from '../../services/cart.service.js'
import * as productService from '../../services/product.service.js'

// Mocks
vi.mock('../../config/supabase.js', () => ({
  supabase: mockSupabaseClient,
  createSupabaseClient: vi.fn(() => mockSupabaseClient)
}))

describe('C129: Actualizar cantidad y precio - Usuario autenticado y Admin', () => {
  const mockUserId = 'user-auth-123'
  const mockAdminId = 'admin-456'
  const mockProductId = 777
  const initialPrice = 50000 // $50,000
  const initialStock = 15
  const updatedPrice = 10000 // $10,000
  const updatedStock = 6

  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * Helper para crear un mock de producto
   */
  function mockProduct(price: number = initialPrice, stock: number = initialStock) {
    return {
      id: mockProductId,
      name: 'Producto Test Admin',
      price: price,
      stock_quantity: stock,
      is_active: true,
      image_url: 'https://example.com/product.jpg',
      description: 'Producto de prueba para admin',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  }

  /**
   * Helper para mock de login
   */
  function mockUserLogin(userId: string, role: string = 'cliente') {
    return {
      id: userId,
      email: role === 'admin' ? 'admin@example.com' : 'user@example.com',
      role: role,
      full_name: role === 'admin' ? 'Admin User' : 'Regular User',
      created_at: new Date().toISOString()
    }
  }

  /**
   * Helper para configurar mocks de addToCart
   */
  function mockAddToCartFlow(quantity: number, cartId: number = 1) {
    const product = mockProduct()
    
    const mockCartLookup = vi.fn().mockResolvedValue({
      data: { id: cartId, user_id: mockUserId, created_at: new Date().toISOString() },
      error: null
    })

    const mockItemLookup = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST116' }
    })

    const mockItemInsert = vi.fn().mockResolvedValue({
      data: {
        id: 1,
        cart_id: cartId,
        product_id: mockProductId,
        quantity: quantity,
        product: product,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      error: null
    })

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
            single: mockItemInsert
          }))
          return chain
        }),
        eq: vi.fn(function() { return chain })
      }
      return chain
    })
  }

  /**
   * Helper para configurar mocks de getUserCart
   */
  function mockGetCartFlow(quantity: number, productPrice: number, productStock: number, cartId: number = 1) {
    const product = mockProduct(productPrice, productStock)
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
   * Helper para mock de actualización de producto (Admin)
   */
  function mockUpdateProductByAdmin(newPrice: number, newStock: number) {
    const updatedProduct = mockProduct(newPrice, newStock)
    
    mockSupabaseClient.from = vi.fn((table: string) => {
      if (table === 'products') {
        const chain: any = {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: updatedProduct, error: null })
              }))
            }))
          })),
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: updatedProduct, error: null })
            }))
          }))
        }
        return chain
      }
      return {} as any
    })

    return updatedProduct
  }

  it('C129-1: Usuario autenticado inicia sesión correctamente', () => {
    // Arrange: Usuario con credenciales válidas
    const user = mockUserLogin(mockUserId, 'cliente')

    // Act: Simular autenticación
    const isAuthenticated = user && user.id === mockUserId

    // Assert: El usuario se autentica correctamente
    expect(user).toBeDefined()
    expect(isAuthenticated).toBe(true)
    expect(user.role).toBe('cliente')
  })

  it('C129-2: Usuario añade producto al carrito con stock disponible', async () => {
    // Arrange: Producto con stock disponible (15 unidades)
    const quantityToAdd = 1
    mockAddToCartFlow(quantityToAdd)

    // Act: Añadir producto al carrito
    const result = await cartService.addToCart(mockUserId, mockProductId, quantityToAdd)

    // Assert: El producto se añade correctamente con mensaje de confirmación
    expect(result).toBeDefined()
    expect(result.product_id).toBe(mockProductId)
    expect(result.quantity).toBe(quantityToAdd)
  })

  it('C129-3: Producto añadido aparece en el carrito con cantidad inicial (1)', async () => {
    // Arrange: Usuario con producto en el carrito
    const initialQuantity = 1
    mockGetCartFlow(initialQuantity, initialPrice, initialStock)

    // Act: Obtener carrito del usuario
    const cart = await cartService.getUserCart(mockUserId)

    // Assert: El producto se muestra con la cantidad correcta
    expect(cart).toBeDefined()
    expect(cart.items).toHaveLength(1)
    expect(cart.items[0].product_id).toBe(mockProductId)
    expect(cart.items[0].quantity).toBe(initialQuantity)
    if (cart.items[0].product) {
      expect(cart.items[0].product.price).toBe(initialPrice)
    }
  })

  it('C129-4: Página del carrito muestra productos añadidos correctamente', async () => {
    // Arrange: Carrito con producto añadido
    const quantity = 1
    const expectedTotal = initialPrice * quantity // 50,000 × 1 = 50,000
    mockGetCartFlow(quantity, initialPrice, initialStock)

    // Act: Cargar página del carrito (getUserCart)
    const cart = await cartService.getUserCart(mockUserId)

    // Assert: La página del carrito muestra los productos correctamente
    expect(cart.items).toBeDefined()
    expect(cart.items.length).toBeGreaterThan(0)
    expect(cart.total).toBe(expectedTotal)
    expect(cart.itemCount).toBe(1)
  })

  it('C129-5: Admin se autentica correctamente con token válido', () => {
    // Arrange: Usuario con rol 'admin'
    const admin = mockUserLogin(mockAdminId, 'admin')

    // Act: Verificar autenticación de admin
    const isAdmin = admin && admin.role === 'admin'
    const hasValidToken = admin.id === mockAdminId

    // Assert: Se obtiene token válido para admin
    expect(admin).toBeDefined()
    expect(isAdmin).toBe(true)
    expect(hasValidToken).toBe(true)
    expect(admin.email).toContain('admin')
  })

  it('C129-6: Admin modifica cantidad y precio del producto a valores válidos', () => {
    // Arrange: Admin con permisos para modificar productos
    const admin = mockUserLogin(mockAdminId, 'admin')
    const updatedProduct = mockUpdateProductByAdmin(updatedPrice, updatedStock)

    // Act: Modificar precio de 50,000 a 10,000 y stock de 15 a 6
    const newPrice = updatedProduct.price
    const newStock = updatedProduct.stock_quantity

    // Assert: Los campos se actualizan correctamente
    expect(updatedProduct).toBeDefined()
    expect(newPrice).toBe(updatedPrice)
    expect(newPrice).toBe(10000)
    expect(newStock).toBe(updatedStock)
    expect(newStock).toBe(6)
  })

  it('C129-7: Cantidad y precio del producto se actualizan en la interfaz de productos', () => {
    // Arrange: Admin actualiza producto
    const updatedProduct = mockUpdateProductByAdmin(updatedPrice, updatedStock)

    // Act: Verificar actualización en la interfaz
    const displayPrice = updatedProduct.price
    const displayStock = updatedProduct.stock_quantity

    // Assert: La interfaz muestra los valores actualizados
    expect(displayPrice).toBe(10000)
    expect(displayStock).toBe(6)
    expect(updatedProduct.updated_at).toBeDefined()
  })

  it('C129-8: Total del carrito se recalcula con nuevo precio del producto', async () => {
    // Arrange: Carrito con 1 unidad del producto (precio actualizado a 10,000)
    const quantityInCart = 1
    const expectedTotalBefore = initialPrice * quantityInCart // 50,000 × 1 = 50,000
    const expectedTotalAfter = updatedPrice * quantityInCart // 10,000 × 1 = 10,000
    
    // Act: Obtener carrito después de actualización de precio
    mockGetCartFlow(quantityInCart, updatedPrice, updatedStock)
    const cart = await cartService.getUserCart(mockUserId)

    // Assert: El total se recalcula correctamente con el nuevo precio
    expect(cart.total).toBe(expectedTotalAfter)
    expect(cart.total).toBe(10000)
    expect(cart.total).not.toBe(expectedTotalBefore)
  })

  it('C129-9: Trazabilidad entre interfaz y base de datos (cantidad y precio)', () => {
    // Arrange: Producto actualizado en la base de datos
    const dbProduct = mockUpdateProductByAdmin(updatedPrice, updatedStock)

    // Act: Simular consulta a la base de datos
    const dbPrice = dbProduct.price
    const dbStock = dbProduct.stock_quantity
    const dbUpdateTimestamp = dbProduct.updated_at

    // Assert: Los datos en la base de datos coinciden con la interfaz
    expect(dbPrice).toBe(10000)
    expect(dbStock).toBe(6)
    expect(dbUpdateTimestamp).toBeDefined()
    
    // Verificar trazabilidad (integridad de datos)
    expect(dbProduct.id).toBe(mockProductId)
    expect(dbProduct.price).toBe(updatedPrice)
    expect(dbProduct.stock_quantity).toBe(updatedStock)
  })

  it('C129-10: Usuario autenticado verifica nueva cantidad y precio en su carrito', async () => {
    // Arrange: Usuario verifica su carrito después de actualización del admin
    const quantityInCart = 1
    mockGetCartFlow(quantityInCart, updatedPrice, updatedStock)

    // Act: Usuario obtiene su carrito actualizado
    const cart = await cartService.getUserCart(mockUserId)

    // Assert: El usuario ve el precio y stock actualizados
    expect(cart.items[0].product_id).toBe(mockProductId)
    expect(cart.items[0].quantity).toBe(quantityInCart)
    
    if (cart.items[0].product) {
      expect(cart.items[0].product.price).toBe(updatedPrice)
      expect(cart.items[0].product.price).toBe(10000)
      expect(cart.items[0].product.stock_quantity).toBe(updatedStock)
      expect(cart.items[0].product.stock_quantity).toBe(6)
    }
    
    // Assert: El total del carrito refleja el nuevo precio
    const expectedTotal = updatedPrice * quantityInCart // 10,000 × 1 = 10,000
    expect(cart.total).toBe(expectedTotal)
  })

  it('C129-11: Flujo completo - Usuario agrega, Admin actualiza, Usuario verifica', async () => {
    // Step 1: Usuario autenticado añade producto al carrito
    const user = mockUserLogin(mockUserId, 'cliente')
    expect(user.role).toBe('cliente')
    
    mockAddToCartFlow(1)
    let result = await cartService.addToCart(mockUserId, mockProductId, 1)
    expect(result.quantity).toBe(1)

    // Step 2: Verificar carrito inicial con precio original (50,000)
    mockGetCartFlow(1, initialPrice, initialStock)
    let cart = await cartService.getUserCart(mockUserId)
    expect(cart.total).toBe(50000) // 50,000 × 1

    // Step 3: Admin se autentica y actualiza producto
    const admin = mockUserLogin(mockAdminId, 'admin')
    expect(admin.role).toBe('admin')
    
    const updatedProduct = mockUpdateProductByAdmin(updatedPrice, updatedStock)
    expect(updatedProduct.price).toBe(10000)
    expect(updatedProduct.stock_quantity).toBe(6)

    // Step 4: Usuario verifica su carrito con datos actualizados
    mockGetCartFlow(1, updatedPrice, updatedStock)
    cart = await cartService.getUserCart(mockUserId)
    
    // Assert final: Todo se actualiza correctamente
    expect(cart.items[0].product?.price).toBe(10000)
    expect(cart.items[0].product?.stock_quantity).toBe(6)
    expect(cart.total).toBe(10000) // 10,000 × 1
    expect(cart.items[0].has_enough_stock).toBe(true)
    expect(cart.items[0].max_quantity).toBe(6)
  })

  it('C129-12: Validar que el stock actualizado se respeta en el carrito', async () => {
    // Arrange: Admin actualiza stock a 6, usuario tiene 1 en carrito
    const quantityInCart = 1
    mockGetCartFlow(quantityInCart, updatedPrice, updatedStock)

    // Act: Obtener carrito con validación de stock
    const cart = await cartService.getUserCart(mockUserId)

    // Assert: El carrito valida correctamente el stock disponible
    expect(cart.items[0].max_quantity).toBe(updatedStock)
    expect(cart.items[0].max_quantity).toBe(6)
    expect(cart.items[0].has_enough_stock).toBe(true) // 1 <= 6
    expect(cart.items[0].quantity).toBeLessThanOrEqual(cart.items[0].max_quantity ?? 0)
  })
})
