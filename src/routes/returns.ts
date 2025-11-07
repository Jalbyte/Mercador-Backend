/**
 * Rutas de gestión de devoluciones (returns)
 *
 * Este módulo define todas las rutas relacionadas con el sistema de devoluciones,
 * incluyendo endpoints para usuarios (crear y cancelar devoluciones) y
 * administradores (procesar y gestionar devoluciones).
 *
 * Funcionalidades implementadas:
 * - ✅ Crear solicitud de devolución (usuario)
 * - ✅ Ver devoluciones propias (usuario)
 * - ✅ Cancelar devolución (usuario)
 * - ✅ Procesar devoluciones (admin)
 * - ✅ Ver todas las devoluciones (admin)
 * - ✅ Ver resumen de devoluciones (admin)
 * - ✅ Gestionar créditos de tienda
 *
 * @module routes/returns
 *
 * @example
 * ```typescript
 * import { returnRoutes } from './routes/returns'
 *
 * // Registrar rutas de devoluciones (requieren autenticación)
 * app.use('/returns/*', authMiddleware)
 * app.route('/returns', returnRoutes)
 * ```
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { returnService } from '../services/return.service.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { cookieToAuthHeader } from '../middlewares/cookieToAuthHeader.js';
import { logger } from '../utils/logger.js';
import {
  ReturnStatus,
  RefundMethod,
  CreateReturnDTO,
  ProcessReturnDTO,
} from '../types/return.types.js';

export const returnRoutes = new OpenAPIHono();

// Aplicar middlewares
returnRoutes.use('*', cookieToAuthHeader);
returnRoutes.use('*', authMiddleware);

// Helper: Obtener user_id del request
function getUserId(c: any): string {
  return c.get('userId');
}

// Helper: Obtener access token del request
function getAccessToken(c: any): string | undefined {
  const authHeader = c.req.header('Authorization');
  return authHeader ? authHeader.replace('Bearer ', '') : undefined;
}

// Helper: Verificar si el usuario es admin
async function isAdmin(c: any): Promise<boolean> {
  const role = c.get('userRole');
  return role === 'admin';
}

// ==================
// SCHEMAS
// ==================

const CreateReturnSchema = z.object({
  order_id: z.number().int().positive(),
  reason: z.string().min(10, 'La razón debe tener al menos 10 caracteres'),
  product_key_ids: z.array(z.uuid()).min(1, 'Debe incluir al menos una clave'),
  notes: z.string().optional(),
});

const ProcessReturnSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  refund_method: z.enum(['original_payment', 'store_credit', 'bank_transfer']).optional(),
  admin_notes: z.string().optional(),
});

const UpdateReturnSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'refunded', 'cancelled']).optional(),
  refund_method: z.enum(['original_payment', 'store_credit', 'bank_transfer']).optional(),
  admin_notes: z.string().optional(),
  refund_amount: z.number().positive().optional(),
});

const ReturnFiltersSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'refunded', 'cancelled']).optional(),
  order_id: z.string().transform(Number).optional(),
  start_date: z.iso.datetime().optional(),
  end_date: z.iso.datetime().optional(),
  page: z.string().transform(Number).default(1),
  limit: z.string().transform(Number).default(10),
});

// ==================
// RUTAS DE USUARIO
// ==================

/**
 * POST /returns - Crear una nueva solicitud de devolución
 */
returnRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['Returns - Usuario'],
    summary: 'Crear solicitud de devolución',
    description: 'Permite al usuario crear una solicitud de devolución para items de una orden',
    security: [{ Bearer: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: CreateReturnSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Devolución creada exitosamente',
      },
      400: {
        description: 'Datos inválidos',
      },
      401: {
        description: 'No autenticado',
      },
      404: {
        description: 'Orden no encontrada',
      },
    },
  }),
  async (c) => {
    try {
      const userId = getUserId(c);
      const accessToken = getAccessToken(c);
      const body = c.req.valid('json');

      const data: CreateReturnDTO = {
        order_id: body.order_id,
        reason: body.reason,
        product_key_ids: body.product_key_ids,
        notes: body.notes,
      };

      const result = await returnService.createReturn(userId, data, accessToken);

      logger.info(`Return created: ${result.id} by user ${userId}`);

      return c.json(
        {
          success: true,
          message: 'Solicitud de devolución creada exitosamente',
          data: result,
        },
        201
      );
    } catch (error: any) {
      logger.error('Error creating return:', error);
      return c.json(
        {
          success: false,
          error: error.message || 'Error al crear la devolución',
        },
        error.statusCode || 500
      );
    }
  }
);

/**
 * GET /returns/my-returns - Obtener devoluciones del usuario actual
 */
returnRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/my-returns',
    tags: ['Returns - Usuario'],
    summary: 'Obtener mis devoluciones',
    description: 'Lista todas las devoluciones del usuario autenticado',
    security: [{ Bearer: [] }],
    request: {
      query: ReturnFiltersSchema.pick({ status: true, page: true, limit: true }),
    },
    responses: {
      200: {
        description: 'Lista de devoluciones del usuario',
      },
      401: {
        description: 'No autenticado',
      },
    },
  }),
  async (c) => {
    try {
      const userId = getUserId(c);
      const accessToken = getAccessToken(c);
      const query = c.req.valid('query');

      const filters = {
        user_id: userId,
        status: query.status as any,
        page: query.page,
        limit: query.limit,
      };

      const result = await returnService.listReturns(filters, accessToken);

      return c.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error: any) {
      logger.error('Error listing user returns:', error);
      return c.json(
        {
          success: false,
          error: error.message || 'Error al obtener las devoluciones',
        },
        error.statusCode || 500
      );
    }
  }
);

/**
 * GET /returns/:id - Obtener detalle de una devolución
 */
returnRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    tags: ['Returns - Usuario'],
    summary: 'Obtener detalle de devolución',
    description: 'Obtiene los detalles completos de una devolución específica',
    security: [{ Bearer: [] }],
    request: {
      params: z.object({
        id: z.string().transform(Number),
      }),
    },
    responses: {
      200: {
        description: 'Detalle de la devolución',
      },
      401: {
        description: 'No autenticado',
      },
      404: {
        description: 'Devolución no encontrada',
      },
    },
  }),
  async (c) => {
    try {
      const accessToken = getAccessToken(c);
      const { id } = c.req.valid('param');

      const result = await returnService.getReturnById(id, accessToken);

      return c.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('Error getting return:', error);
      return c.json(
        {
          success: false,
          error: error.message || 'Error al obtener la devolución',
        },
        error.statusCode || 500
      );
    }
  }
);

/**
 * POST /returns/:id/cancel - Cancelar una devolución
 */
returnRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/cancel',
    tags: ['Returns - Usuario'],
    summary: 'Cancelar devolución',
    description: 'Permite al usuario cancelar su solicitud de devolución si está en estado pending',
    security: [{ Bearer: [] }],
    request: {
      params: z.object({
        id: z.string().transform(Number),
      }),
    },
    responses: {
      200: {
        description: 'Devolución cancelada exitosamente',
      },
      400: {
        description: 'No se puede cancelar la devolución',
      },
      401: {
        description: 'No autenticado',
      },
      404: {
        description: 'Devolución no encontrada',
      },
    },
  }),
  async (c) => {
    try {
      const userId = getUserId(c);
      const accessToken = getAccessToken(c);
      const { id } = c.req.valid('param');

      const result = await returnService.cancelReturn(id, userId, accessToken);

      logger.info(`Return ${id} cancelled by user ${userId}`);

      return c.json({
        success: true,
        message: 'Devolución cancelada exitosamente',
        data: result,
      });
    } catch (error: any) {
      logger.error('Error cancelling return:', error);
      return c.json(
        {
          success: false,
          error: error.message || 'Error al cancelar la devolución',
        },
        error.statusCode || 500
      );
    }
  }
);

/**
 * GET /returns/eligibility/:orderId - Verificar elegibilidad de devolución
 */
returnRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/eligibility/{orderId}',
    tags: ['Returns - Usuario'],
    summary: 'Verificar elegibilidad de devolución',
    description: 'Verifica si una orden es elegible para devolución y muestra las claves disponibles',
    security: [{ Bearer: [] }],
    request: {
      params: z.object({
        orderId: z.string().transform(Number),
      }),
    },
    responses: {
      200: {
        description: 'Información de elegibilidad con claves disponibles',
      },
      401: {
        description: 'No autenticado',
      },
    },
  }),
  async (c) => {
    try {
      const accessToken = getAccessToken(c);
      const { orderId } = c.req.valid('param');

      const result = await returnService.checkReturnEligibility(orderId, accessToken);

      return c.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('Error checking eligibility:', error);
      return c.json(
        {
          success: false,
          error: error.message || 'Error al verificar elegibilidad',
        },
        error.statusCode || 500
      );
    }
  }
);

/**
 * GET /returns/store-credits - Obtener balance de créditos de tienda
 */
returnRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/store-credits',
    tags: ['Returns - Usuario'],
    summary: 'Obtener créditos de tienda',
    description: 'Obtiene el balance y lista de créditos de tienda activos del usuario',
    security: [{ Bearer: [] }],
    responses: {
      200: {
        description: 'Balance de créditos de tienda',
      },
      401: {
        description: 'No autenticado',
      },
    },
  }),
  async (c) => {
    try {
      const userId = getUserId(c);
      const accessToken = getAccessToken(c);

      const result = await returnService.getUserStoreCreditBalance(userId, accessToken);

      return c.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('Error getting store credits:', error);
      return c.json(
        {
          success: false,
          error: error.message || 'Error al obtener créditos de tienda',
        },
        error.statusCode || 500
      );
    }
  }
);

/**
 * GET /returns/:id/history - Obtener historial de cambios de una devolución
 */
returnRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/{id}/history',
    tags: ['Returns - Usuario'],
    summary: 'Obtener historial de devolución',
    description: 'Obtiene el historial completo de cambios de estado de una devolución',
    security: [{ Bearer: [] }],
    request: {
      params: z.object({
        id: z.string().transform(Number),
      }),
    },
    responses: {
      200: {
        description: 'Historial de la devolución',
      },
      401: {
        description: 'No autenticado',
      },
      403: {
        description: 'Sin permisos',
      },
    },
  }),
  async (c) => {
    try {
      const accessToken = getAccessToken(c);
      const { id } = c.req.valid('param');

      const result = await returnService.getReturnHistory(id, accessToken);

      return c.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('Error getting return history:', error);
      return c.json(
        {
          success: false,
          error: error.message || 'Error al obtener el historial',
        },
        error.statusCode || 500
      );
    }
  }
);

// ==================
// RUTAS DE ADMIN
// ==================

/**
 * GET /returns/admin/all - Listar todas las devoluciones (admin)
 */
returnRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/admin/all',
    tags: ['Returns - Admin'],
    summary: '[Admin] Listar todas las devoluciones',
    description: 'Lista todas las devoluciones del sistema con filtros',
    security: [{ Bearer: [] }],
    request: {
      query: ReturnFiltersSchema,
    },
    responses: {
      200: {
        description: 'Lista de todas las devoluciones',
      },
      401: {
        description: 'No autenticado',
      },
      403: {
        description: 'No autorizado (requiere rol admin)',
      },
    },
  }),
  async (c) => {
    try {
      const admin = await isAdmin(c);
      const accessToken = getAccessToken(c);
      if (!admin) {
        return c.json(
          {
            success: false,
            error: 'No tienes permisos para acceder a este recurso',
          },
          403
        );
      }

      const query = c.req.valid('query');

      const filters = {
        status: query.status as any,
        order_id: query.order_id,
        start_date: query.start_date ? new Date(query.start_date) : undefined,
        end_date: query.end_date ? new Date(query.end_date) : undefined,
        page: query.page,
        limit: query.limit,
      };

      const result = await returnService.listReturns(filters, accessToken);

      return c.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error: any) {
      logger.error('Error listing all returns:', error);
      return c.json(
        {
          success: false,
          error: error.message || 'Error al obtener las devoluciones',
        },
        error.statusCode || 500
      );
    }
  }
);

/**
 * POST /returns/admin/:id/process - Procesar devolución (aprobar/rechazar)
 */
returnRoutes.openapi(
  createRoute({
    method: 'post',
    path: '/admin/{id}/process',
    tags: ['Returns - Admin'],
    summary: '[Admin] Procesar devolución',
    description: 'Aprueba o rechaza una solicitud de devolución',
    security: [{ Bearer: [] }],
    request: {
      params: z.object({
        id: z.string().transform(Number),
      }),
      body: {
        content: {
          'application/json': {
            schema: ProcessReturnSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Devolución procesada exitosamente',
      },
      400: {
        description: 'Datos inválidos',
      },
      401: {
        description: 'No autenticado',
      },
      403: {
        description: 'No autorizado (requiere rol admin)',
      },
      404: {
        description: 'Devolución no encontrada',
      },
    },
  }),
  async (c) => {
    try {
      const admin = await isAdmin(c);
      const accessToken = getAccessToken(c);
      if (!admin) {
        return c.json(
          {
            success: false,
            error: 'No tienes permisos para realizar esta acción',
          },
          403
        );
      }

      const userId = getUserId(c);
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');

      const data: ProcessReturnDTO = {
        status: body.status as any,
        refund_method: body.refund_method as any,
        admin_notes: body.admin_notes,
      };

      const result = await returnService.processReturn(id, data, userId, accessToken);

      logger.info(`Return ${id} processed by admin ${userId}: ${data.status}`);

      return c.json({
        success: true,
        message: `Devolución ${data.status === 'approved' ? 'aprobada' : 'rechazada'} exitosamente`,
        data: result,
      });
    } catch (error: any) {
      logger.error('Error processing return:', error);
      return c.json(
        {
          success: false,
          error: error.message || 'Error al procesar la devolución',
        },
        error.statusCode || 500
      );
    }
  }
);

/**
 * PUT /returns/admin/:id - Actualizar devolución (admin)
 */
returnRoutes.openapi(
  createRoute({
    method: 'put',
    path: '/admin/{id}',
    tags: ['Returns - Admin'],
    summary: '[Admin] Actualizar devolución',
    description: 'Actualiza los datos de una devolución',
    security: [{ Bearer: [] }],
    request: {
      params: z.object({
        id: z.string().transform(Number),
      }),
      body: {
        content: {
          'application/json': {
            schema: UpdateReturnSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Devolución actualizada exitosamente',
      },
      400: {
        description: 'Datos inválidos',
      },
      401: {
        description: 'No autenticado',
      },
      403: {
        description: 'No autorizado (requiere rol admin)',
      },
      404: {
        description: 'Devolución no encontrada',
      },
    },
  }),
  async (c) => {
    try {
      const admin = await isAdmin(c);
      const accessToken = getAccessToken(c);
      if (!admin) {
        return c.json(
          {
            success: false,
            error: 'No tienes permisos para realizar esta acción',
          },
          403
        );
      }

      const userId = getUserId(c);
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');

      const result = await returnService.updateReturn(id, body as any, userId, accessToken);

      logger.info(`Return ${id} updated by admin ${userId}`);

      return c.json({
        success: true,
        message: 'Devolución actualizada exitosamente',
        data: result,
      });
    } catch (error: any) {
      logger.error('Error updating return:', error);
      return c.json(
        {
          success: false,
          error: error.message || 'Error al actualizar la devolución',
        },
        error.statusCode || 500
      );
    }
  }
);

/**
 * GET /returns/admin/summary - Obtener resumen de devoluciones
 */
returnRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/admin/summary',
    tags: ['Returns - Admin'],
    summary: '[Admin] Obtener resumen de devoluciones',
    description: 'Obtiene estadísticas y resumen de todas las devoluciones',
    security: [{ Bearer: [] }],
    responses: {
      200: {
        description: 'Resumen de devoluciones',
      },
      401: {
        description: 'No autenticado',
      },
      403: {
        description: 'No autorizado (requiere rol admin)',
      },
    },
  }),
  async (c) => {
    try {
      const admin = await isAdmin(c);
      const accessToken = getAccessToken(c);
      if (!admin) {
        return c.json(
          {
            success: false,
            error: 'No tienes permisos para acceder a este recurso',
          },
          403
        );
      }

      const result = await returnService.getReturnsSummary(accessToken);

      return c.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('Error getting returns summary:', error);
      return c.json(
        {
          success: false,
          error: error.message || 'Error al obtener el resumen',
        },
        error.statusCode || 500
      );
    }
  }
);
