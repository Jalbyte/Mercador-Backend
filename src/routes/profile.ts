/**
 * Rutas de gestión de perfiles de usuario
 *
 * Este módulo define todas las rutas relacionadas con la gestión de perfiles
 * de usuario en la aplicación Mercador, incluyendo consulta y actualización
 * de información personal, subida de imágenes de perfil y gestión de datos.
 *
 * Funcionalidades implementadas:
 * - ✅ Obtener perfil del usuario actual
 * - ✅ Actualizar información del perfil
 * - ✅ Subir imagen de perfil
 * - ✅ Validación de datos de perfil
 * - ✅ Integración con autenticación
 *
 * @module routes/profile
 *
 * @example
 * ```typescript
 * import { profileRoutes } from './routes/profile'
 *
 * // Registrar rutas de perfil (requieren autenticación)
 * app.use('/profile/*', authMiddleware)
 * app.route('/profile', profileRoutes)
 *
 * // Rutas disponibles:
 * // GET /profile - Obtener perfil del usuario
 * // PUT /profile - Actualizar perfil del usuario
 * ```
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import * as userService from '../services/user.service.js'
import { authMiddleware } from '../middlewares/authMiddleware.js'
import { cookieToAuthHeader } from '../middlewares/cookieToAuthHeader.js'

export const profileRoutes = new OpenAPIHono()

// Aplicar middleware para convertir cookie a Authorization header
profileRoutes.use('*', cookieToAuthHeader)

// Aplicar middleware de autenticación a todas las rutas de perfil
profileRoutes.use('*', authMiddleware)

// Helper: Extrae token desde Authorization header
function getTokenFromRequest(c: any): string | undefined {
  const authHeader = c.req.header('Authorization')
  return authHeader ? authHeader.replace('Bearer ', '') : undefined
}

// Schema para actualizar perfil
export const UpdateProfileSchema = z
  .object({
    full_name: z
      .string()
      .min(2, "El nombre completo debe tener al menos 2 caracteres")
      .optional()
      .openapi({
        example: "Juan Amador",
        description: "Nombre completo del usuario"
      }),

    country: z
      .string()
      .optional()
      .openapi({
        example: "Colombia",
        description: "País de residencia"
      }),
    
    // El email no se debe cambiar desde aquí para evitar problemas de sincronización con auth.users
    // email: z
    //   .string()
    //   .email("Correo inválido")
    //   .optional()
    //   .openapi({
    //     example: "juan@example.com",
    //     description: "Correo electrónico del usuario"
    //   }),

    // El campo de imagen será manejado como un archivo
    image_file: z
      .any()
      .optional()
      .openapi({
        type: 'string',
        format: 'binary',
        description: "Archivo de imagen de perfil para subir"
      })
  })
  .openapi("UpdateProfileFormData")


const updateProfileRoute = createRoute({
    method: "post",
    path: "/update",
    security: [{ Bearer: [] }],
    request: {
      body: {
        content: {
          "multipart/form-data": {
            schema: UpdateProfileSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: "Perfil actualizado con éxito",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              message: z.string(),
              data: z.any().optional()
            })
          }
        }
      },
      400: {
        description: "Error de validación",
         content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              errors: z.any()
            })
          }
        }
      },
      401: {
        description: "No autorizado",
        content: {
            "application/json": {
                schema: z.object({
                    success: z.boolean(),
                    error: z.string()
                })
            }
        }
      },
      500: {
        description: "Error del servidor",
        content: {
            "application/json": {
                schema: z.object({
                    success: z.boolean(),
                    error: z.string()
                })
            }
        }
      }
    },
    summary: "Actualizar perfil de usuario"
})

profileRoutes.openapi(updateProfileRoute, async (c) => {
    const userId = c.get('userId')
    const token = getTokenFromRequest(c)

    if (!userId) {
        return c.json({ success: false, error: 'No autorizado' }, 401)
    }

    const data = await c.req.parseBody()

    // Hono no parsea bien los tipos en `parseBody`, los validamos con Zod
    const result = UpdateProfileSchema.safeParse(data)
    if (!result.success) {
      return c.json({ success: false, errors: result.error.format() }, 400)
    }
    
    const { full_name, country, image_file } = result.data

    try {
        const updatedProfile = await userService.updateUserProfile(userId, {
            full_name,
            country,
            image_file
        }, token)

    return c.json({ 
      success: true, 
      message: "Perfil actualizado correctamente",
      data: updatedProfile
    }, 200)
    } catch (error) {
        console.error('Error updating profile:', error)
        return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update profile'
        }, 500)
    }
  }
)

export default profileRoutes
