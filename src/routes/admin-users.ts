import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import * as userService from '../services/user.service.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'
import { cookieToAuthHeader } from '../middlewares/cookieToAuthHeader.js'
import { z as zod } from 'zod'

export const adminUserRoutes = new OpenAPIHono()

// Middleware para auth y cookies
adminUserRoutes.use('*', cookieToAuthHeader)
adminUserRoutes.use('*', authMiddleware)

// Schemas
const AdminUpdateUserSchema = zod.object({
  full_name: zod.string().min(2).optional(),
  country: zod.string().optional(),
  email: zod.string().email().optional(),
  // Agrega más campos según tu tabla
})

// Listar todos los usuarios (solo admin)
adminUserRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/',
    security: [{ Bearer: [] }],
    responses: {
      200: {
        description: 'Lista de usuarios',
        content: {
          'application/json': {
            schema: z.array(z.object({
              id: z.string(),
              email: z.string(),
              full_name: z.string(),
              role: z.string(),
              image: z.string().optional(),
              country: z.string().optional(),
              created_at: z.string().optional(),
              updated_at: z.string().optional(),
              avatar_url: z.string().optional(),
              is_deleted: z.boolean().optional(),
            }))
          }
        }
      },
      401: { description: 'No autorizado', content: { 'application/json': { schema: z.object({ error: z.string() }) } } },
      500: { description: 'Error', content: { 'application/json': { schema: z.object({ error: z.string() }) } } },
    },
    summary: 'Listar todos los usuarios (admin)',
  }),
  async (c) => {
    const adminId = c.get('userId')
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    if (!adminId || typeof adminId !== 'string') return c.json({ error: 'No autorizado' }, 401)
    try {
      const users = await userService.getAllUsers(adminId, token ?? '')
      return c.json(users, 200)
    } catch (err: any) {
      if (err.message === 'No autorizado') return c.json({ error: 'No autorizado' }, 401)
      return c.json({ error: err.message || 'Error' }, 500)
    }
  }
)

// Actualizar usuario (solo admin)
adminUserRoutes.openapi(
  createRoute({
    method: 'put',
    path: '/:userId',
    security: [{ Bearer: [] }],
    request: {
      params: z.object({ userId: z.string() }),
      body: {
        content: {
          'application/json': { schema: AdminUpdateUserSchema }
        }
      }
    },
    responses: {
      200: { description: 'Usuario actualizado', content: { 'application/json': { schema: z.object({ success: z.boolean(), user: z.any() }) } } },
      401: { description: 'No autorizado', content: { 'application/json': { schema: z.object({ error: z.string() }) } } },
      400: { description: 'Error de validación', content: { 'application/json': { schema: z.object({ error: z.string() }) } } },
      500: { description: 'Error', content: { 'application/json': { schema: z.object({ error: z.string() }) } } },
    },
    summary: 'Actualizar usuario (admin)',
  }),
  async (c) => {
    const adminId = c.get('userId')
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const userId = c.req.param('userId')
    if (!adminId || typeof adminId !== 'string' || !userId || typeof userId !== 'string') return c.json({ error: 'No autorizado' }, 401)
    const body = await c.req.json()
    const result = AdminUpdateUserSchema.safeParse(body)
    if (!result.success) return c.json({ error: 'Datos inválidos' }, 400)
    try {
      const user = await userService.adminUpdateUser(adminId, userId, result.data, token ?? '')
      return c.json({ success: true, user }, 200)
    } catch (err: any) {
      // Log detallado para depuración
      console.error('Error en adminUpdateUser:', err);
      if (err && err.stack) {
        console.error('Stack trace:', err.stack);
      }
      if (err.message === 'No autorizado') return c.json({ error: 'No autorizado' }, 401)
      return c.json({ error: err.message || 'Error', details: err }, 500)
    }
  }
)

// Eliminar usuario (solo admin)
adminUserRoutes.openapi(
  createRoute({
    method: 'delete',
    path: '/:userId',
    security: [{ Bearer: [] }],
    request: {
      params: z.object({ userId: z.string() })
    },
    responses: {
      200: { description: 'Usuario eliminado', content: { 'application/json': { schema: z.object({ success: z.boolean() }) } } },
      401: { description: 'No autorizado', content: { 'application/json': { schema: z.object({ error: z.string() }) } } },
      500: { description: 'Error', content: { 'application/json': { schema: z.object({ error: z.string() }) } } },
    },
    summary: 'Eliminar usuario (admin)',
  }),
  async (c) => {
    const adminId = c.get('userId')
    const token = c.req.header('Authorization')?.replace('Bearer ', '')
    const userId = c.req.param('userId')
    if (!adminId || typeof adminId !== 'string' || !userId || typeof userId !== 'string') return c.json({ error: 'No autorizado' }, 401)
    try {
      const result = await userService.adminDeleteUser(adminId, userId, token ?? '')
      return c.json(result, 200)
    } catch (err: any) {
      if (err.message === 'No autorizado') return c.json({ error: 'No autorizado' }, 401)
      return c.json({ error: err.message || 'Error' }, 500)
    }
  }
)

export default adminUserRoutes
