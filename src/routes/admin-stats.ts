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

// GET /admin/stats/overview - Estadísticas generales completas
adminStatsRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/stats/overview',
    security: [{ Bearer: [] }],
    responses: {
      200: {
        description: 'Estadísticas generales completas',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.object({
                totalRevenue: z.number(),
                totalOrders: z.number(),
                totalUsers: z.number(),
                totalProducts: z.number(),
                avgOrderValue: z.number(),
                conversionRate: z.number(),
                revenueGrowth: z.number(),
                ordersGrowth: z.number()
              })
            })
          }
        }
      },
      401: {
        description: 'No autorizado',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string()
            })
          }
        }
      },
      500: {
        description: 'Error del servidor',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string()
            })
          }
        }
      }
    },
    summary: 'Estadísticas generales del negocio'
  }),
  async (c) => {
    const adminId = c.get('userId')
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    
    if (!adminId) return c.json({ error: 'No autorizado' }, 401)
    
    try {
      const stats = await adminService.getOverviewStats(adminId, token)
      return c.json({ success: true, data: stats }, 200)
    } catch (err: any) {
      return c.json({ error: err.message }, err.message === 'No autorizado' ? 401 : 500)
    }
  }
)

// GET /admin/stats/sales - Ventas por período
adminStatsRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/stats/sales',
    security: [{ Bearer: [] }],
    request: {
      query: z.object({
        period: z.enum(['7d', '30d', '90d']).optional().default('30d')
      })
    },
    responses: {
      200: {
        description: 'Ventas por período',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.object({
                period: z.string(),
                sales: z.array(z.object({
                  date: z.string(),
                  revenue: z.number(),
                  orders: z.number()
                })),
                totalRevenue: z.number(),
                totalOrders: z.number()
              })
            })
          }
        }
      },
      401: {
        description: 'No autorizado',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string()
            })
          }
        }
      },
      500: {
        description: 'Error del servidor',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string()
            })
          }
        }
      }
    },
    summary: 'Ventas por período de tiempo'
  }),
  async (c) => {
    const adminId = c.get('userId')
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const { period } = c.req.valid('query')
    
    if (!adminId) return c.json({ error: 'No autorizado' }, 401)
    
    try {
      const salesData = await adminService.getSalesByPeriod(adminId, period, token)
      return c.json({ success: true, data: salesData }, 200)
    } catch (err: any) {
      return c.json({ error: err.message }, err.message === 'No autorizado' ? 401 : 500)
    }
  }
)

// GET /admin/stats/top-products - Top productos más vendidos
adminStatsRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/stats/top-products',
    security: [{ Bearer: [] }],
    request: {
      query: z.object({
        limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 10)
      })
    },
    responses: {
      200: {
        description: 'Top productos más vendidos',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.array(z.object({
                id: z.number(),
                name: z.string(),
                image_url: z.string().nullable(),
                total_sold: z.number(),
                revenue: z.number(),
                stock_quantity: z.number()
              }))
            })
          }
        }
      },
      401: {
        description: 'No autorizado',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string()
            })
          }
        }
      },
      500: {
        description: 'Error del servidor',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string()
            })
          }
        }
      }
    },
    summary: 'Top productos más vendidos'
  }),
  async (c) => {
    const adminId = c.get('userId')
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const { limit } = c.req.query()
    
    if (!adminId) return c.json({ error: 'No autorizado' }, 401)
    
    try {
      const products = await adminService.getTopProducts(adminId, limit ? parseInt(limit, 10) : 10, token)
      return c.json({ success: true, data: products }, 200)
    } catch (err: any) {
      return c.json({ error: err.message }, err.message === 'No autorizado' ? 401 : 500)
    }
  }
)

// GET /admin/stats/low-stock - Productos con bajo stock
adminStatsRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/stats/low-stock',
    security: [{ Bearer: [] }],
    request: {
      query: z.object({
        threshold: z.string().optional().transform(val => val ? parseInt(val, 10) : 10)
      })
    },
    responses: {
      200: {
        description: 'Productos con bajo stock',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.array(z.object({
                id: z.number(),
                name: z.string(),
                stock_quantity: z.number(),
                status: z.string(),
                image_url: z.string().nullable()
              }))
            })
          }
        }
      },
      401: {
        description: 'No autorizado',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string()
            })
          }
        }
      },
      500: {
        description: 'Error del servidor',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string()
            })
          }
        }
      }
    },
    summary: 'Productos con bajo stock'
  }),
  async (c) => {
    const adminId = c.get('userId')
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const { threshold } = c.req.query()
    
    if (!adminId) return c.json({ error: 'No autorizado' }, 401)
    
    try {
      const products = await adminService.getLowStockProducts(adminId, threshold ? parseInt(threshold, 10) : 10, token)
      return c.json({ success: true, data: products }, 200)
    } catch (err: any) {
      return c.json({ error: err.message }, err.message === 'No autorizado' ? 401 : 500)
    }
  }
)

// GET /admin/stats/recent-users - Usuarios recientes
adminStatsRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/stats/recent-users',
    security: [{ Bearer: [] }],
    request: {
      query: z.object({
        limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 10)
      })
    },
    responses: {
      200: {
        description: 'Usuarios recientes',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.array(z.object({
                id: z.string(),
                email: z.string(),
                full_name: z.string().nullable(),
                country: z.string().nullable(),
                created_at: z.string(),
                role: z.string()
              }))
            })
          }
        }
      },
      401: {
        description: 'No autorizado',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string()
            })
          }
        }
      },
      500: {
        description: 'Error del servidor',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string()
            })
          }
        }
      }
    },
    summary: 'Usuarios registrados recientemente'
  }),
  async (c) => {
    const adminId = c.get('userId')
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const { limit } = c.req.query()
    
    if (!adminId) return c.json({ error: 'No autorizado' }, 401)
    
    try {
      const users = await adminService.getRecentUsers(adminId, limit ? parseInt(limit, 10) : 10, token)
      return c.json({ success: true, data: users }, 200)
    } catch (err: any) {
      return c.json({ error: err.message }, err.message === 'No autorizado' ? 401 : 500)
    }
  }
)

// GET /admin/orders/recent - Órdenes recientes
adminStatsRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/orders/recent',
    security: [{ Bearer: [] }],
    request: {
      query: z.object({
        limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 10)
      })
    },
    responses: {
      200: {
        description: 'Órdenes recientes',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.array(OrderSchema)
            })
          }
        }
      },
      401: {
        description: 'No autorizado',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string()
            })
          }
        }
      },
      500: {
        description: 'Error del servidor',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string()
            })
          }
        }
      }
    },
    summary: 'Órdenes más recientes del sistema'
  }),
  async (c) => {
    const adminId = c.get('userId')
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const { limit } = c.req.query()
    
    if (!adminId) return c.json({ error: 'No autorizado' }, 401)
    
    try {
      const orders = await adminService.getRecentOrders(adminId, limit ? parseInt(limit, 10) : 10, token)
      return c.json({ success: true, data: orders }, 200)
    } catch (err: any) {
      return c.json({ error: err.message }, err.message === 'No autorizado' ? 401 : 500)
    }
  }
)

// GET /admin/stats/top-categories - Categorías más vendidas
adminStatsRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/stats/top-categories',
    security: [{ Bearer: [] }],
    responses: {
      200: {
        description: 'Categorías más vendidas',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.array(z.object({
                category: z.string(),
                total_sold: z.number(),
                revenue: z.number(),
                product_count: z.number(),
                percentage: z.number()
              }))
            })
          }
        }
      },
      401: {
        description: 'No autorizado',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string()
            })
          }
        }
      },
      500: {
        description: 'Error del servidor',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string()
            })
          }
        }
      }
    },
    summary: 'Categorías de productos más vendidas'
  }),
  async (c) => {
    const adminId = c.get('userId')
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    
    if (!adminId) return c.json({ error: 'No autorizado' }, 401)
    
    try {
      const categories = await adminService.getTopCategories(adminId, token)
      return c.json({ success: true, data: categories }, 200)
    } catch (err: any) {
      return c.json({ error: err.message }, err.message === 'No autorizado' ? 401 : 500)
    }
  }
)

// GET /admin/stats/conversion - Tasa de conversión
adminStatsRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/stats/conversion',
    security: [{ Bearer: [] }],
    responses: {
      200: {
        description: 'Tasa de conversión y métricas relacionadas',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.object({
                conversionRate: z.number(),
                totalVisitors: z.number(),
                totalPurchases: z.number(),
                avgTimeToConvert: z.number(),
                abandonmentRate: z.number()
              })
            })
          }
        }
      },
      401: {
        description: 'No autorizado',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string()
            })
          }
        }
      },
      500: {
        description: 'Error del servidor',
        content: {
          'application/json': {
            schema: z.object({
              error: z.string()
            })
          }
        }
      }
    },
    summary: 'Tasa de conversión del sitio'
  }),
  async (c) => {
    const adminId = c.get('userId')
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    
    if (!adminId) return c.json({ error: 'No autorizado' }, 401)
    
    try {
      const conversion = await adminService.getConversionStats(adminId, token)
      return c.json({ success: true, data: conversion }, 200)
    } catch (err: any) {
      return c.json({ error: err.message }, err.message === 'No autorizado' ? 401 : 500)
    }
  }
)

export default adminStatsRoutes
