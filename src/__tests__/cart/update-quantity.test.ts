import { describe, it, expect, beforeEach, vi } from 'vitest'
import '../mocks/supabase.mock.js'
import { mockSupabaseClient, resetSupabaseMocks } from '../mocks/supabase.mock.js'
import * as cartService from '@/services/cart.service.js'
import { OpenAPIHono } from '@hono/zod-openapi'
import cartRoutes from '@/routes/cart.js'

/**
 * TestRail Case ID: C113
 * Title: Actualizar cantidad a un valor mayor a 1
 * 
 * Steps:
 * 1. Asegurarse de que un producto existe en el carrito con cantidad inicial de 1
 * 2. Navegar a la página del carrito de compras → Página carga correctamente
 * 3. Localizar el campo de entrada de cantidad → Campo se muestra en la interfaz
 * 4. Cambiar la cantidad del producto a un valor mayor a 1 (ej: 3)
 * 5. Confirmar la actualización (se confirma automáticamente) → Acción de actualización se inicia
 * 6. Verificar que la cantidad del producto se actualiza al nuevo valor (3)
 * 7. Verificar que el total del carrito se recalcula correctamente (68,000 x 3 = 204,000)
 * 8. Verificar que la UI se actualiza instantáneamente sin recargar la página
 * 
 * Expected Results:
 * - La cantidad del producto se actualiza correctamente
 * - El total del carrito se recalcula (precio × nueva cantidad)
 * - La respuesta es inmediata (API REST)
 * - Los datos se persisten en la base de datos
 */

describe('C113: Actualizar cantidad a un valor mayor a 1', () => {
  const mockUserId = 'user-123'
  const mockProductId = 1
  const initialQuantity = 1
  const newQuantity = 3
  const productPrice = 68000

  beforeEach(() => {
    vi.clearAllMocks()
    resetSupabaseMocks()
  })

  // Helper: Mock completo del flujo de carrito
  const mockCartFlow = (cartItem: any, updatedQuantity?: number) => {
    const mockCart = { id: 1, user_id: mockUserId }
    const mockProduct = {
      id: mockProductId,
      name: 'Test Product',
      price: productPrice,
      stock_quantity: 10,
    }

    const item = updatedQuantity ? { ...cartItem, quantity: updatedQuantity } : cartItem

    ;(mockSupabaseClient.from as any).mockImplementation((table: string) => {
      if (table === 'carts') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockCart, error: null }),
        }
      }
      if (table === 'cart_items') {
        return {
          select: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: item, error: null }),
        }
      }
      if (table === 'products') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockProduct, error: null }),
        }
      }
      return {}
    })
  }

  it('C113-1: Producto debe estar en el carrito con cantidad inicial de 1', async () => {
    // Step 1: Asegurarse de que el producto existe en el carrito
    const mockCart = { id: 1, user_id: mockUserId }
    
    const mockCartItem = {
      id: 1,
      cart_id: 1,
      product_id: mockProductId,
      quantity: initialQuantity,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      product: {
        id: mockProductId,
        name: 'Test Product',
        price: productPrice,
        stock_quantity: 10,
      }
    }

    // Mock: getUserCart necesita un array de cart_items
    ;(mockSupabaseClient.from as any).mockImplementation((table: string) => {
      if (table === 'carts') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockCart, error: null }),
        }
      }
      if (table === 'cart_items') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [mockCartItem], error: null }),
        }
      }
      return {}
    })

    // Act: Obtener el carrito del usuario
    const result = await cartService.getUserCart(mockUserId)

    // Assert: El producto debe estar en el carrito con cantidad 1
    expect(result).toBeDefined()
    expect(result.items).toHaveLength(1)
    expect(result.items[0].quantity).toBe(initialQuantity)
    expect(result.items[0].product_id).toBe(mockProductId)
  })

  it('C113-2: Servicio debe proporcionar datos para que la página cargue correctamente', async () => {
    // Step 2: Navegar a la página del carrito - el servicio proporciona los datos
    const mockCart = {
      id: 1,
      user_id: mockUserId,
    }

    const mockCartItem = {
      id: 1,
      cart_id: 1,
      product_id: mockProductId,
      quantity: initialQuantity,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      product: {
        id: mockProductId,
        name: 'Test Product',
        price: productPrice,
        stock_quantity: 10,
      }
    }

    // Mock: obtener cart y cart items
    ;(mockSupabaseClient.from as any).mockImplementation((table: string) => {
      if (table === 'carts') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockCart, error: null }),
        }
      }
      if (table === 'cart_items') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [mockCartItem], error: null }),
        }
      }
      return {}
    })

    // Act: Obtener carrito mediante servicio (simula carga de página)
    const result = await cartService.getUserCart(mockUserId)

    // Assert: La página del carrito carga correctamente con los datos
    expect(result).toBeDefined()
    expect(result.items).toBeDefined()
    expect(result.items.length).toBeGreaterThan(0)
    expect(result.total).toBe(productPrice * initialQuantity)
  })

  it('C113-3: Campo de cantidad debe estar disponible en la respuesta del carrito', async () => {
    // Step 3: Localizar el campo de entrada de cantidad
    const mockCart = { id: 1, user_id: mockUserId }
    
    const mockCartItem = {
      id: 1,
      cart_id: 1,
      product_id: mockProductId,
      quantity: initialQuantity, // Campo de cantidad
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      product: {
        id: mockProductId,
        name: 'Test Product',
        price: productPrice,
        stock_quantity: 10,
      }
    }

    ;(mockSupabaseClient.from as any).mockImplementation((table: string) => {
      if (table === 'carts') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockCart, error: null }),
        }
      }
      if (table === 'cart_items') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [mockCartItem], error: null }),
        }
      }
      return {}
    })

    // Act: Obtener carrito
    const result = await cartService.getUserCart(mockUserId)

    // Assert: El campo de cantidad está presente en la respuesta
    expect(result.items[0]).toHaveProperty('quantity')
    expect(typeof result.items[0].quantity).toBe('number')
    expect(result.items[0].quantity).toBe(initialQuantity)
  })

  it('C113-4: Servicio debe aceptar y actualizar la nueva cantidad del producto', async () => {
    // Step 4: Cambiar la cantidad del producto a un valor mayor a 1 (3)
    const mockCartItem = {
      id: 1,
      cart_id: 1,
      product_id: mockProductId,
      quantity: initialQuantity,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      product: {
        id: mockProductId,
        name: 'Test Product',
        price: productPrice,
        stock_quantity: 10,
      }
    }

    // Usar helper para mock completo
    mockCartFlow(mockCartItem, newQuantity)

    // Act: Actualizar cantidad mediante servicio
    const result = await cartService.updateCartItem(mockUserId, 1, newQuantity)

    // Assert: El servicio acepta la nueva cantidad
    expect(result.quantity).toBe(newQuantity)
    expect(result.quantity).toBe(3)
  })

  it('C113-5: Actualización se confirma automáticamente (acción se inicia)', async () => {
    // Step 5: Confirmar la actualización (automática en API REST)
    const updateSpy = vi.fn().mockReturnThis()
    
    const mockUpdatedItem = {
      id: 'cart-item-1',
      quantity: newQuantity,
      updated_at: new Date().toISOString(),
    }

    vi.mocked(mockSupabaseClient.from).mockReturnValue({
      update: updateSpy,
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockUpdatedItem, error: null }),
    } as any)

    // Act: Actualizar cantidad mediante servicio
    await cartService.updateCartItem(mockUserId, 1, newQuantity)

    // Assert: La acción de actualización se inicia (se llama update)
    expect(updateSpy).toHaveBeenCalledWith({ 
      quantity: newQuantity, 
      updated_at: expect.any(String) 
    })
  })

  it('C113-6: Cantidad del producto se actualiza al nuevo valor (3)', async () => {
    // Step 6: Verificar que la cantidad se actualiza correctamente
    const mockUpdatedItem = {
      id: 'cart-item-1',
      user_id: mockUserId,
      product_id: mockProductId,
      quantity: newQuantity, // 3
      product: {
        id: mockProductId,
        name: 'Test Product',
        price: productPrice,
      }
    }

    vi.mocked(mockSupabaseClient.from).mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockUpdatedItem, error: null }),
    } as any)

    // Act: Actualizar cantidad
    const result = await cartService.updateCartItem(mockUserId, 1, newQuantity)

    // Assert: La cantidad del producto se muestra como 3
    expect(result.quantity).toBe(newQuantity)
    expect(result.quantity).toBe(3)
  })

  it('C113-7: Total del carrito se recalcula correctamente (68,000 x 3 = 204,000)', async () => {
    // Step 7: Verificar que el total se recalcula correctamente
    const mockCart = { id: 1, user_id: mockUserId }
    
    const mockCartItem = {
      id: 1,
      cart_id: 1,
      product_id: mockProductId,
      quantity: newQuantity, // 3
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      product: {
        id: mockProductId,
        name: 'Test Product',
        price: productPrice, // 68,000
        stock_quantity: 10,
      }
    }

    ;(mockSupabaseClient.from as any).mockImplementation((table: string) => {
      if (table === 'carts') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockCart, error: null }),
        }
      }
      if (table === 'cart_items') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [mockCartItem], error: null }),
        }
      }
      return {}
    })

    // Act: Obtener carrito después de actualizar
    const result = await cartService.getUserCart(mockUserId)

    // Assert: El total del carrito refleja el nuevo precio
    const expectedTotal = productPrice * newQuantity // 68,000 × 3 = 204,000
    expect(result.total).toBe(expectedTotal)
    expect(result.total).toBe(204000)
  })

  it('C113-8: Servicio responde instantáneamente (UI se actualiza sin recargar)', async () => {
    // Step 8: Verificar que el servicio responde inmediatamente
    const mockCartItem = {
      id: 1,
      cart_id: 1,
      product_id: mockProductId,
      quantity: initialQuantity,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      product: {
        id: mockProductId,
        name: 'Test Product',
        price: productPrice,
        stock_quantity: 10,
      }
    }

    // Usar helper para mock completo
    mockCartFlow(mockCartItem, newQuantity)

    const startTime = Date.now()

    // Act: Actualizar mediante servicio
    const result = await cartService.updateCartItem(mockUserId, 1, newQuantity)
    
    const endTime = Date.now()
    const responseTime = endTime - startTime

    // Assert: La respuesta es instantánea (simula UI sin recargar)
    expect(responseTime).toBeLessThan(1000) // Respuesta en menos de 1 segundo
    expect(result.quantity).toBe(newQuantity)
    
    // El resultado contiene la nueva cantidad y se puede calcular el nuevo total
    const newTotal = result.product!.price * result.quantity
    expect(newTotal).toBe(204000)
  })

  it('C113-9: Flujo completo de actualización de cantidad mediante servicio', async () => {
    // Test de integración: flujo completo usando el servicio
    const mockCart = { id: 1, user_id: mockUserId }

    // Step 1: Carrito inicial con cantidad 1
    const initialCartItem = {
      id: 1,
      cart_id: 1,
      product_id: mockProductId,
      quantity: initialQuantity,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      product: {
        id: mockProductId,
        name: 'Test Product',
        price: productPrice,
        stock_quantity: 10,
      }
    }

    // Mock para obtener carrito inicial
    ;(mockSupabaseClient.from as any).mockImplementation((table: string) => {
      if (table === 'carts') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockCart, error: null }),
        }
      }
      if (table === 'cart_items') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [initialCartItem], error: null }),
        }
      }
      return {}
    })

    // Step 2: Obtener carrito inicial
    const initialCart = await cartService.getUserCart(mockUserId)
    
    expect(initialCart.items[0].quantity).toBe(initialQuantity)
    const initialTotal = productPrice * initialQuantity
    expect(initialCart.total).toBe(initialTotal)

    // Step 3: Actualizar cantidad a 3
    const updatedCartItem = {
      ...initialCartItem,
      quantity: newQuantity,
      updated_at: new Date().toISOString(),
    }

    // Usar helper para actualización
    mockCartFlow(initialCartItem, newQuantity)

    const updatedItem = await cartService.updateCartItem(mockUserId, 1, newQuantity)

    // Step 4: Verificar actualización
    expect(updatedItem.quantity).toBe(newQuantity)
    
    // Step 5: Verificar recálculo del total en el carrito
    ;(mockSupabaseClient.from as any).mockImplementation((table: string) => {
      if (table === 'carts') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockCart, error: null }),
        }
      }
      if (table === 'cart_items') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [updatedCartItem], error: null }),
        }
      }
      return {}
    })

    const finalCart = await cartService.getUserCart(mockUserId)

    const expectedTotal = productPrice * newQuantity // 204,000
    expect(finalCart.total).toBe(expectedTotal)
  })
})
