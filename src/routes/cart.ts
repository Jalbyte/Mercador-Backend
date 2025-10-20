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
 * - ✅ Operaciones batch para múltiples items
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
 * // POST /cart/items/manage - Gestionar item individual
 * // POST /cart/items/batch - Gestionar múltiples items en batch
 * ```
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import * as cartService from '../services/cart.service.js'
import { cookieToAuthHeader } from '../middlewares/cookieToAuthHeader.js'

const cartRoutes = new OpenAPIHono()

// Aplicar middleware para convertir cookie a Authorization header
cartRoutes.use('*', cookieToAuthHeader)

// Helper: Extrae token desde Authorization header
function getTokenFromRequest(c: any): string | undefined {
  const authHeader = c.req.header('Authorization')
  return authHeader ? authHeader.replace('Bearer ', '') : undefined
}

// Schemas
const ProductSummary = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number().positive(),
  image_url: z.string().url().optional(),
  stock_quantity: z.number().int().min(0).optional()
})

const CartItem = z.object({
  id: z.number(),
  cart_id: z.number().optional(),
  product_id: z.number(),
  quantity: z.number().int().min(1),
  created_at: z.string(),
  updated_at: z.string(),
  product: ProductSummary.optional(),
  max_quantity: z.number().int().min(0).optional(), // Stock disponible
  is_available: z.boolean().optional(), // Si el producto aún existe
  has_enough_stock: z.boolean().optional() // Si hay suficiente stock
})

const Cart = z.object({
  items: z.array(CartItem),
  total: z.number().min(0),
  itemCount: z.number().int().min(0),
  valid: z.boolean().optional() // Si todos los items son válidos
})

const AddToCartData = z.object({
  productId: z.union([z.number(), z.string().transform(Number)]),
  quantity: z.union([z.number(), z.string().transform(Number)]).pipe(z.number().int().min(1))
})

const UpdateCartItemData = z.object({
  quantity: z.union([z.number(), z.string().transform(Number)]).pipe(z.number().int().min(1))
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
    const token = getTokenFromRequest(c)

    if (!userId) {
      return c.json({
        success: false,
        error: 'Not authenticated'
      }, 401)
    }

    const cart = await cartService.getUserCart(userId, token)

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
    const token = getTokenFromRequest(c)
    const { productId, quantity } = c.req.valid('json')

    if (!userId) {
      return c.json({
        success: false,
        error: 'Not authenticated'
      }, 401)
    }

    const cartItem = await cartService.addToCart(userId, Number(productId), quantity, token)

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

// Nuevo endpoint: Manejar items del carrito (agregar, actualizar o eliminar según cantidad)
const manageCartItemData = z.object({
  productId: z.union([z.number(), z.string().transform(Number)]),
  quantity: z.union([z.number(), z.string().transform(Number)]).pipe(z.number().int().min(0)) // Permite 0 para eliminar
})

const batchCartItemData = z.object({
  operations: z.array(z.object({
    productId: z.union([z.number(), z.string().transform(Number)]),
    quantity: z.union([z.number(), z.string().transform(Number)]).pipe(z.number().int().min(0)) // 0 = eliminar
  })).min(1)
})

const manageCartItemRoute = createRoute({
  method: 'post',
  path: '/items/manage',
  request: {
    body: {
      content: {
        'application/json': {
          schema: manageCartItemData
        }
      },
      required: true
    }
  },
  responses: {
    200: {
      description: 'Cart item managed (added, updated, or removed)',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            action: z.enum(['added', 'updated', 'removed']),
            data: CartItem.optional(),
            message: z.string().optional()
          })
        }
      }
    },
    401: {
      description: 'Not authenticated'
    },
    400: {
      description: 'Failed to manage cart item'
    }
  }
})

cartRoutes.openapi(manageCartItemRoute, async (c) => {
  try {
    const userId = c.get('userId')
    const token = getTokenFromRequest(c)
    const { productId, quantity } = c.req.valid('json')

    if (!userId) {
      return c.json({
        success: false,
        error: 'Not authenticated'
      }, 401)
    }

    // Si quantity es 0, eliminar el item
    if (quantity === 0) {
      // Primero buscar el item en el carrito
      const cart = await cartService.getUserCart(userId, token)
      const existingItem = cart.items?.find(item => item.product_id === productId)
      
      if (existingItem) {
        await cartService.removeFromCart(userId, existingItem.id, token)
        return c.json({
          success: true,
          action: 'removed',
          message: 'Item removed from cart'
        })
      } else {
        return c.json({
          success: true,
          action: 'removed',
          message: 'Item not in cart'
        })
      }
    }

    // Verificar si el item ya existe en el carrito
    const cart = await cartService.getUserCart(userId, token)
    const existingItem = cart.items?.find(item => item.product_id === productId)

    if (existingItem) {
      // Actualizar cantidad existente
      const updatedItem = await cartService.updateCartItem(userId, existingItem.id, quantity, token)
      return c.json({
        success: true,
        action: 'updated',
        data: updatedItem
      })
    } else {
      // Agregar nuevo item
      const newItem = await cartService.addToCart(userId, productId, quantity, token)
      return c.json({
        success: true,
        action: 'added',
        data: newItem
      })
    }
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to manage cart item'
    }, 400)
  }
})

// Nuevo endpoint: Batch manage
const batchManageCartItemsRoute = createRoute({
  method: 'post',
  path: '/items/batch',
  request: {
    body: {
      content: {
        'application/json': {
          schema: batchCartItemData
        }
      },
      required: true
    }
  },
  responses: {
    200: {
      description: 'Batch operations completed',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            results: z.array(z.object({
              productId: z.number(),
              action: z.string(),
              error: z.string().optional()
            }))
          })
        }
      }
    },
    401: {
      description: 'Not authenticated'
    },
    400: {
      description: 'Failed to execute batch operations'
    }
  }
})

cartRoutes.openapi(batchManageCartItemsRoute, async (c) => {
  try {
    const userId = c.get('userId')
    const token = getTokenFromRequest(c)
    const { operations } = c.req.valid('json')

    if (!userId) {
      return c.json({
        success: false,
        error: 'Not authenticated'
      }, 401)
    }

    const result = await cartService.manageBatchCartItems(userId, operations, token)

    return c.json(result)
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to execute batch operations'
    }, 400)
  }
})

const updateCartItemRoute = createRoute({
  method: 'put',
  path: '/items/:itemId',
  request: {
    params: z.object({
      itemId: z.string().transform(Number)
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
    const token = getTokenFromRequest(c)
    const { itemId } = c.req.valid('param')
    const { quantity } = c.req.valid('json')

    if (!userId) {
      return c.json({
        success: false,
        error: 'Not authenticated'
      }, 401)
    }

    const cartItem = await cartService.updateCartItem(userId, itemId, quantity, token)

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
      itemId: z.string().transform(Number)
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
    const token = getTokenFromRequest(c)
    const { itemId } = c.req.valid('param')

    if (!userId) {
      return c.json({
        success: false,
        error: 'Not authenticated'
      }, 401)
    }

    await cartService.removeFromCart(userId, itemId, token)

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
    const token = getTokenFromRequest(c)

    if (!userId) {
      return c.json({
        success: false,
        error: 'Not authenticated'
      }, 401)
    }

    await cartService.clearCart(userId, token)

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
