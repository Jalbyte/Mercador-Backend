/**
 * Rutas de administración y estadísticas
 *
 * Este módulo define todas las rutas relacionadas con el panel de
 * administración, incluyendo estadísticas, métricas y gestión de órdenes.
 *
 * Funcionalidades implementadas:
 * - ✅ Dashboard con estadísticas consolidadas
 * - ✅ Listado de órdenes con filtros y paginación
 * - ✅ Métricas de ventas y revenue
 * - ✅ Análisis de productos y stock
 *
 * @module routes/admin-stats
 *
 * @example
 * ```typescript
 * import adminStatsRoutes from './routes/admin-stats'
 *
 * // Registrar rutas de administración (requieren autenticación de admin)
 * app.use('/admin/*', authMiddleware)
 * app.route('/admin', adminStatsRoutes)
 *
 * // Rutas disponibles:
 * // GET /admin/stats/dashboard - Estadísticas consolidadas
 * // GET /admin/orders - Lista de órdenes con filtros
 * ```
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import * as adminService from '../services/admin.service.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'
import { cookieToAuthHeader } from '../middlewares/cookieToAuthHeader.js'

export const adminStatsRoutes = new OpenAPIHono()

// Middleware para auth y cookies
adminStatsRoutes.use('*', cookieToAuthHeader)
adminStatsRoutes.use('*', authMiddleware)

// Schemas
const DashboardStatsSchema = z.object({
  totalSales: z.number().int().min(0),
  totalRevenue: z.number().min(0),
  totalProducts: z.number().int().min(0),
  totalUsers: z.number().int().min(0),
  lowStockProducts: z.number().int().min(0),
  recentOrders: z.number().int().min(0),
  topSellingProduct: z.string(),
  averageOrderValue: z.number().min(0)
})

const ProductSummarySchema = z.object({
  id: z.number(),
  name: z.string(),
  image_url: z.string().optional().nullable()
})

const OrderItemSchema = z.object({
  id: z.number(),
  order_id: z.number(),
  product_id: z.number(),
  quantity: z.number(),
  price: z.number(),
  product: ProductSummarySchema.optional()
})

const OrderSchema = z.object({
  id: z.number(),
  user_id: z.string(),
  status: z.string(),
  total_amount: z.number(),
  shipping_address: z.any(),
  payment_method: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  order_items: z.array(OrderItemSchema).optional()
})

const OrdersListResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(OrderSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number()
  })
})

// GET /admin/stats/dashboard - Estadísticas consolidadas
adminStatsRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/stats/dashboard',
    security: [{ Bearer: [] }],
    responses: {
      200: {
        description: 'Estadísticas consolidadas del dashboard',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: DashboardStatsSchema
            })
          }
        }
      },
      401: {
        description: 'No autorizado',
        content: {
          'application/json': {
            schema: z.object({ error: z.string() })
          }
        }
      },
      500: {
        description: 'Error del servidor',
        content: {
          'application/json': {
            schema: z.object({ error: z.string() })
          }
        }
      }
    },
    summary: 'Obtener estadísticas consolidadas del dashboard (solo admin)',
    description: 'Retorna métricas clave del negocio incluyendo ventas, ingresos, productos, usuarios y productos más vendidos'
  }),
  async (c) => {
    const adminId = c.get('userId')
    const token = c.req.header('Authorization')?.replace('Bearer ', '')

    if (!adminId || typeof adminId !== 'string') {
      return c.json({ error: 'No autorizado' }, 401)
    }

    try {
      const stats = await adminService.getDashboardStats(adminId, token)
      return c.json({
        success: true,
        data: stats
      }, 200)
    } catch (err: any) {
      if (err.message === 'No autorizado') {
        return c.json({ error: 'No autorizado' }, 401)
      }
      return c.json({ error: err.message || 'Error al obtener estadísticas' }, 500)
    }
  }
)

// GET /admin/orders - Lista de órdenes con filtros
adminStatsRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/orders',
    security: [{ Bearer: [] }],
    request: {
      query: z.object({
        status: z.enum(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']).optional(),
        page: z.string().optional().transform(val => val ? parseInt(val, 10) : 1),
        limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 10)
      })
    },
    responses: {
      200: {
        description: 'Lista de órdenes',
        content: {
          'application/json': {
            schema: OrdersListResponseSchema
          }
        }
      },
      401: {
        description: 'No autorizado',
        content: {
          'application/json': {
            schema: z.object({ error: z.string() })
          }
        }
      },
      500: {
        description: 'Error del servidor',
        content: {
          'application/json': {
            schema: z.object({ error: z.string() })
          }
        }
      }
    },
    summary: 'Listar todas las órdenes del sistema (solo admin)',
    description: 'Retorna una lista paginada de todas las órdenes con sus items. Permite filtrar por estado.'
  }),
  async (c) => {
    const adminId = c.get('userId')
    const token = c.req.header('Authorization')?.replace('Bearer ', '')

    if (!adminId || typeof adminId !== 'string') {
      return c.json({ error: 'No autorizado' }, 401)
    }

    try {
      const query = c.req.query()
      const filters = {
        status: query.status,
        page: query.page ? parseInt(query.page, 10) : 1,
        limit: query.limit ? parseInt(query.limit, 10) : 10
      }

      const result = await adminService.getAllOrdersAdmin(adminId, filters, token)
      
      return c.json({
        success: true,
        data: result.orders,
        pagination: result.pagination
      }, 200)
    } catch (err: any) {
      if (err.message === 'No autorizado') {
        return c.json({ error: 'No autorizado' }, 401)
      }
      return c.json({ error: err.message || 'Error al obtener órdenes' }, 500)
    }
  }
)

// GET /admin/products/stats - Estadísticas de productos con ventas
adminStatsRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/products/stats',
    security: [{ Bearer: [] }],
    responses: {
      200: {
        description: 'Estadísticas de productos con ventas',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.array(z.object({
                id: z.number(),
                name: z.string(),
                price: z.number(),
                stock_quantity: z.number(),
                status: z.string(),
                total_sold: z.number(),
                revenue: z.number()
              }))
            })
          }
        }
      },
      401: {
        description: 'No autorizado',
        content: {
          'application/json': {
            schema: z.object({ error: z.string() })
          }
        }
      },
      500: {
        description: 'Error del servidor',
        content: {
          'application/json': {
            schema: z.object({ error: z.string() })
          }
        }
      }
    },
    summary: 'Obtener estadísticas de productos con ventas (solo admin)',
    description: 'Retorna lista de productos con estadísticas de ventas totales y revenue generado'
  }),
  async (c) => {
    const adminId = c.get('userId')
    const token = c.req.header('Authorization')?.replace('Bearer ', '')

    if (!adminId || typeof adminId !== 'string') {
      return c.json({ error: 'No autorizado' }, 401)
    }

    try {
      const productsStats = await adminService.getProductsWithStats(adminId, token)
      return c.json({
        success: true,
        data: productsStats
      }, 200)
    } catch (err: any) {
      if (err.message === 'No autorizado') {
        return c.json({ error: 'No autorizado' }, 401)
      }
      return c.json({ error: err.message || 'Error al obtener estadísticas de productos' }, 500)
    }
  }
)

export default adminStatsRoutes
