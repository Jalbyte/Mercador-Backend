/**
 * Rutas de gestión del carrito de compras
 *
 * Este módulo define todas las rutas relacionadas con el carrito de compras
 * de la aplicación Mercador, incluyendo operaciones CRUD para items del carrito,
 * cálculo de totales y gestión de cantidades.
 *
 * Funcionalidades implementadas:
 * - ✅ Obtener carrito del usuario
 * - ✅ Agregar productos al carrito
 * - ✅ Actualizar cantidad de items
 * - ✅ Eliminar items del carrito
 * - ✅ Limpiar carrito completo
 * - ✅ Cálculo automático de totales
 * - ✅ Validación de stock y cantidades
 *
 * @module routes/cart
 *
 * @example
 * ```typescript
 * import cartRoutes from './routes/cart'
 *
 * // Registrar rutas del carrito (requieren autenticación)
 * app.use('/cart/*', authMiddleware)
 * app.route('/cart', cartRoutes)
 *
 * // Rutas disponibles:
 * // GET /cart - Obtener carrito del usuario
 * // POST /cart - Agregar producto al carrito
 * // PUT /cart/:itemId - Actualizar cantidad de item
 * // DELETE /cart/:itemId - Eliminar item del carrito
 * // DELETE /cart - Limpiar carrito completo
 * ```
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import * as cartService from '../services/cart.service.js'

const cartRoutes = new OpenAPIHono()

// Schemas
const ProductSummary = z.object({
  id: z.string().uuid(),
  name: z.string(),
  price: z.number().positive(),
  image_url: z.string().url().optional()
})

const CartItem = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  product_id: z.string().uuid(),
  quantity: z.number().int().min(1),
  created_at: z.string(),
  updated_at: z.string(),
  product: ProductSummary.optional()
})

const Cart = z.object({
  items: z.array(CartItem),
  total: z.number().min(0),
  itemCount: z.number().int().min(0)
})

const AddToCartData = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1)
})

const UpdateCartItemData = z.object({
  quantity: z.number().int().min(1)
})

const GetCartResponse = z.object({
  success: z.boolean(),
  data: Cart
})

const AddToCartResponse = z.object({
  success: z.boolean(),
  data: CartItem
})

const UpdateCartItemResponse = z.object({
  success: z.boolean(),
  data: CartItem
})

const RemoveFromCartResponse = z.object({
  success: z.boolean(),
  message: z.string()
})

const ClearCartResponse = z.object({
  success: z.boolean(),
  message: z.string()
})

// Routes
const getCartRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      description: 'User cart',
      content: {
        'application/json': {
          schema: GetCartResponse
        }
      }
    },
    401: {
      description: 'Not authenticated'
    },
    500: {
      description: 'Failed to fetch cart'
    }
  }
})

cartRoutes.openapi(getCartRoute, async (c) => {
  try {
    const userId = c.get('userId')

    if (!userId) {
      return c.json({
        success: false,
        error: 'Not authenticated'
      }, 401)
    }

    const cart = await cartService.getUserCart(userId)

    return c.json({
      success: true,
      data: cart
    })
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch cart'
    }, 500)
  }
})

const addToCartRoute = createRoute({
  method: 'post',
  path: '/items',
  request: {
    body: {
      content: {
        'application/json': {
          schema: AddToCartData
        }
      },
      required: true
    }
  },
  responses: {
    200: {
      description: 'Item added to cart',
      content: {
        'application/json': {
          schema: AddToCartResponse
        }
      }
    },
    401: {
      description: 'Not authenticated'
    },
    400: {
      description: 'Failed to add item to cart'
    }
  }
})

cartRoutes.openapi(addToCartRoute, async (c) => {
  try {
    const userId = c.get('userId')
  const { productId, quantity } = c.req.valid('json')

    if (!userId) {
      return c.json({
        success: false,
        error: 'Not authenticated'
      }, 401)
    }

    const cartItem = await cartService.addToCart(userId, productId, quantity)

    return c.json({
      success: true,
      data: cartItem
    })
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add item to cart'
    }, 400)
  }
})

const updateCartItemRoute = createRoute({
  method: 'put',
  path: '/items/:itemId',
  request: {
    params: z.object({
      itemId: z.string().uuid()
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdateCartItemData
        }
      },
      required: true
    }
  },
  responses: {
    200: {
      description: 'Cart item updated',
      content: {
        'application/json': {
          schema: UpdateCartItemResponse
        }
      }
    },
    401: {
      description: 'Not authenticated'
    },
    400: {
      description: 'Failed to update cart item'
    }
  }
})

cartRoutes.openapi(updateCartItemRoute, async (c) => {
  try {
    const userId = c.get('userId')
  const { itemId } = c.req.valid('param')
  const { quantity } = c.req.valid('json')

    if (!userId) {
      return c.json({
        success: false,
        error: 'Not authenticated'
      }, 401)
    }

    const cartItem = await cartService.updateCartItem(userId, itemId, quantity)

    return c.json({
      success: true,
      data: cartItem
    })
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update cart item'
    }, 400)
  }
})

const removeFromCartRoute = createRoute({
  method: 'delete',
  path: '/items/:itemId',
  request: {
    params: z.object({
      itemId: z.string().uuid()
    })
  },
  responses: {
    200: {
      description: 'Item removed from cart',
      content: {
        'application/json': {
          schema: RemoveFromCartResponse
        }
      }
    },
    401: {
      description: 'Not authenticated'
    },
    500: {
      description: 'Failed to remove item from cart'
    }
  }
})

cartRoutes.openapi(removeFromCartRoute, async (c) => {
  try {
    const userId = c.get('userId')
  const { itemId } = c.req.valid('param')

    if (!userId) {
      return c.json({
        success: false,
        error: 'Not authenticated'
      }, 401)
    }

    await cartService.removeFromCart(userId, itemId)

    return c.json({
      success: true,
      message: 'Item removed from cart'
    })
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove item from cart'
    }, 500)
  }
})

const clearCartRoute = createRoute({
  method: 'delete',
  path: '/',
  responses: {
    200: {
      description: 'Cart cleared',
      content: {
        'application/json': {
          schema: ClearCartResponse
        }
      }
    },
    401: {
      description: 'Not authenticated'
    },
    500: {
      description: 'Failed to clear cart'
    }
  }
})

cartRoutes.openapi(clearCartRoute, async (c) => {
  try {
    const userId = c.get('userId')

    if (!userId) {
      return c.json({
        success: false,
        error: 'Not authenticated'
      }, 401)
    }

    await cartService.clearCart(userId)

    return c.json({
      success: true,
      message: 'Cart cleared successfully'
    })
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clear cart'
    }, 500)
  }
})

export default cartRoutes
