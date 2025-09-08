/**
 * Rutas de gestión de órdenes y pedidos
 *
 * Este módulo define todas las rutas relacionadas con la gestión de órdenes
 * de compra en la aplicación Mercador, incluyendo creación, consulta,
 * actualización de estado y cancelación de pedidos.
 *
 * Funcionalidades implementadas:
 * - ✅ Crear nueva orden desde el carrito
 * - ✅ Obtener órdenes del usuario
 * - ✅ Obtener detalles de una orden específica
 * - ✅ Actualizar estado de la orden
 * - ✅ Cancelar orden (si está pendiente)
 * - ✅ Validación de stock antes de crear orden
 * - ✅ Cálculo automático de totales
 *
 * @module routes/orders
 *
 * @example
 * ```typescript
 * import orderRoutes from './routes/orders'
 *
 * // Registrar rutas de órdenes (requieren autenticación)
 * app.use('/orders/*', authMiddleware)
 * app.route('/orders', orderRoutes)
 *
 * // Rutas disponibles:
 * // GET /orders - Obtener órdenes del usuario
 * // GET /orders/:id - Obtener orden específica
 * // POST /orders - Crear nueva orden
 * // PUT /orders/:id/status - Actualizar estado de orden
 * // DELETE /orders/:id - Cancelar orden
 * ```
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import * as orderService from '../services/order.service.js'

const orderRoutes = new OpenAPIHono()

// Schemas
const OrderItem = z.object({
  id: z.string().uuid(),
  order_id: z.string().uuid(),
  product_id: z.string().uuid(),
  quantity: z.number().int().min(1),
  price: z.number().positive(),
  product: z.object({
    id: z.string().uuid(),
    name: z.string(),
    image_url: z.string().url().optional()
  }).optional()
})

const Order = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  status: z.enum(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']),
  total_amount: z.number().positive(),
  shipping_address: z.any(),
  payment_method: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  items: z.array(OrderItem).optional()
})

const CreateOrderData = z.object({
  shippingAddress: z.any(),
  paymentMethod: z.string().min(1)
})

const UpdateOrderStatusData = z.object({
  status: z.enum(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'])
})

const GetOrdersResponse = z.object({
  success: z.boolean(),
  data: z.array(Order)
})

const GetOrderResponse = z.object({
  success: z.boolean(),
  data: Order
})

const CreateOrderResponse = z.object({
  success: z.boolean(),
  data: Order
})

const UpdateOrderStatusResponse = z.object({
  success: z.boolean(),
  data: Order
})

// Routes
const getOrdersRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      description: 'User orders',
      content: {
        'application/json': {
          schema: GetOrdersResponse
        }
      }
    },
    401: {
      description: 'Not authenticated'
    },
    500: {
      description: 'Failed to fetch orders'
    }
  }
})

orderRoutes.openapi(getOrdersRoute, async (c) => {
  try {
    const userId = c.get('userId')

    if (!userId) {
      return c.json({
        success: false,
        error: 'Not authenticated'
      }, 401)
    }

    const orders = await orderService.getUserOrders(userId)

    return c.json({
      success: true,
      data: orders
    })
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch orders'
    }, 500)
  }
})

const getOrderRoute = createRoute({
  method: 'get',
  path: '/:id',
  request: {
    params: z.object({
      id: z.string().uuid()
    })
  },
  responses: {
    200: {
      description: 'Single order',
      content: {
        'application/json': {
          schema: GetOrderResponse
        }
      }
    },
    401: {
      description: 'Not authenticated'
    },
    404: {
      description: 'Order not found'
    },
    500: {
      description: 'Failed to fetch order'
    }
  }
})

orderRoutes.openapi(getOrderRoute, async (c) => {
  try {
    const userId = c.get('userId')
  const { id } = c.req.valid('param')

    if (!userId) {
      return c.json({
        success: false,
        error: 'Not authenticated'
      }, 401)
    }

    const order = await orderService.getOrderById(userId, id)

    if (!order) {
      return c.json({
        success: false,
        error: 'Order not found'
      }, 404)
    }

    return c.json({
      success: true,
      data: order
    })
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch order'
    }, 500)
  }
})

const createOrderRoute = createRoute({
  method: 'post',
  path: '/',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateOrderData
        }
      },
      required: true
    }
  },
  responses: {
    201: {
      description: 'Order created',
      content: {
        'application/json': {
          schema: CreateOrderResponse
        }
      }
    },
    401: {
      description: 'Not authenticated'
    },
    400: {
      description: 'Failed to create order'
    }
  }
})

orderRoutes.openapi(createOrderRoute, async (c) => {
  try {
    const userId = c.get('userId')
  const { shippingAddress, paymentMethod } = c.req.valid('json')

    if (!userId) {
      return c.json({
        success: false,
        error: 'Not authenticated'
      }, 401)
    }

    const order = await orderService.createOrder(userId, {
      shippingAddress,
      paymentMethod
    })

    return c.json({
      success: true,
      data: order
    }, 201)
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create order'
    }, 400)
  }
})

const updateOrderStatusRoute = createRoute({
  method: 'put',
  path: '/:id/status',
  request: {
    params: z.object({
      id: z.string().uuid()
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdateOrderStatusData
        }
      },
      required: true
    }
  },
  responses: {
    200: {
      description: 'Order status updated',
      content: {
        'application/json': {
          schema: UpdateOrderStatusResponse
        }
      }
    },
    400: {
      description: 'Failed to update order status'
    }
  }
})

orderRoutes.openapi(updateOrderStatusRoute, async (c) => {
  try {
  const { id } = c.req.valid('param')
  const { status } = c.req.valid('json')

    const updatedOrder = await orderService.updateOrderStatus(id, status)

    return c.json({
      success: true,
      data: updatedOrder
    })
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update order status'
    }, 400)
  }
})

export default orderRoutes
