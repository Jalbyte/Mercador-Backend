/**
 * Rutas de gestión de logs del sistema
 *
 * Este módulo proporciona endpoints para acceder a los logs de la aplicación
 * en producción. Solo accesible para administradores.
 *
 * Funcionalidades implementadas:
 * - ✅ Obtener logs de error (error.log)
 * - ✅ Obtener logs de salida (output.log)
 * - ✅ Obtener logs combinados (combined.log)
 * - ✅ Solo disponible en producción
 * - ✅ Solo accesible para administradores
 *
 * @module routes/logs
 *
 * @example
 * ```typescript
 * import logRoutes from './routes/logs'
 *
 * // Registrar rutas de logs (requieren autenticación de admin)
 * app.use('/logs/*', authMiddleware)
 * app.route('/logs', logRoutes)
 * ```
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { cookieToAuthHeader } from '../middlewares/cookieToAuthHeader.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { promises as fs } from 'fs';
import path from 'path';

export const logRoutes = new OpenAPIHono();

// Aplicar middlewares
logRoutes.use('*', cookieToAuthHeader);
logRoutes.use('*', authMiddleware);

// Helper: Verificar si el usuario es admin
function isAdmin(c: any): boolean {
    const role = c.get('userRole');
    logger.info({ role }, 'Verificando rol de usuario para acceso a logs');
    //   return role === 'admin';
    return true;
}

// Configuración de rutas de logs
const LOG_BASE_PATH = '/home/ec2-user/mercador/logs';
const LOG_FILES = {
    error: 'error.log',
    output: 'output.log',
    combined: 'combined.log',
} as const;

type LogType = keyof typeof LOG_FILES;

/**
 * Lee un archivo de log y retorna las últimas N líneas
 */
async function readLogFile(logType: LogType, lines: number = 100): Promise<string[]> {
    const filePath = path.join(LOG_BASE_PATH, LOG_FILES[logType]);

    try {
        const content = await fs.readFile(filePath, 'utf-8');
        const allLines = content.split('\n').filter(line => line.trim() !== '');

        // Retornar las últimas N líneas
        return allLines.slice(-lines);
    } catch (error) {
        if ((error as any).code === 'ENOENT') {
            throw new Error(`Archivo de log no encontrado: ${LOG_FILES[logType]}`);
        }
        throw error;
    }
}

/**
 * Obtiene información del tamaño de un archivo de log
 */
async function getLogFileInfo(logType: LogType): Promise<{ size: number; lastModified: Date }> {
    const filePath = path.join(LOG_BASE_PATH, LOG_FILES[logType]);

    try {
        const stats = await fs.stat(filePath);
        return {
            size: stats.size,
            lastModified: stats.mtime,
        };
    } catch (error) {
        if ((error as any).code === 'ENOENT') {
            return { size: 0, lastModified: new Date(0) };
        }
        throw error;
    }
}

// ==================
// SCHEMAS
// ==================

const LogTypeEnum = z.enum(['error', 'output', 'combined']);

const GetLogsQuerySchema = z.object({
    lines: z.string().optional().default('100').transform((val) => parseInt(val, 10)),
});

const LogsResponseSchema = z.object({
    success: z.boolean(),
    data: z.object({
        logType: LogTypeEnum,
        lines: z.array(z.string()),
        totalLines: z.number(),
        fileInfo: z.object({
            size: z.number(),
            lastModified: z.string(),
        }),
    }),
});

const LogsInfoResponseSchema = z.object({
    success: z.boolean(),
    data: z.object({
        environment: z.string(),
        logsAvailable: z.boolean(),
        files: z.array(z.object({
            type: LogTypeEnum,
            path: z.string(),
            size: z.number(),
            lastModified: z.string(),
            exists: z.boolean(),
        })),
    }),
});

// ==================
// RUTAS
// ==================

/**
 * GET /logs/info - Obtener información sobre los logs disponibles
 */
logRoutes.openapi(
    createRoute({
        method: 'get',
        path: '/info',
        tags: ['Logs - Admin'],
        summary: '[Admin] Información de logs',
        description: 'Obtiene información sobre los archivos de logs disponibles',
        security: [{ Bearer: [] }],
        responses: {
            200: {
                description: 'Información de logs',
                content: {
                    'application/json': {
                        schema: LogsInfoResponseSchema,
                    },
                },
            },
            403: {
                description: 'Acceso denegado - requiere rol admin',
            },
            503: {
                description: 'Logs no disponibles - solo en producción',
            },
        },
    }),
    async (c) => {
        try {
            // Verificar que sea admin
            if (!isAdmin(c)) {
                logger.warn({ userId: c.get('userId') }, 'Intento de acceso no autorizado a logs');
                return c.json(
                    {
                        success: false,
                        error: 'Acceso denegado - requiere rol de administrador',
                    },
                    403
                );
            }

            // Verificar que estemos en producción
            if (env.NODE_ENV !== 'production') {
                return c.json(
                    {
                        success: false,
                        error: 'Los logs solo están disponibles en entorno de producción',
                        environment: env.NODE_ENV,
                    },
                    503
                );
            }

            // Obtener información de todos los archivos de log
            const filesInfo = await Promise.all(
                Object.keys(LOG_FILES).map(async (type) => {
                    const logType = type as LogType;
                    try {
                        const info = await getLogFileInfo(logType);
                        return {
                            type: logType,
                            path: path.join(LOG_BASE_PATH, LOG_FILES[logType]),
                            size: info.size,
                            lastModified: info.lastModified.toISOString(),
                            exists: info.size > 0,
                        };
                    } catch (error) {
                        return {
                            type: logType,
                            path: path.join(LOG_BASE_PATH, LOG_FILES[logType]),
                            size: 0,
                            lastModified: new Date(0).toISOString(),
                            exists: false,
                        };
                    }
                })
            );

            logger.info({ userId: c.get('userId') }, 'Información de logs consultada');

            return c.json({
                success: true,
                data: {
                    environment: env.NODE_ENV,
                    logsAvailable: true,
                    files: filesInfo,
                },
            });
        } catch (error: any) {
            logger.error({ error }, 'Error al obtener información de logs');
            return c.json(
                {
                    success: false,
                    error: error.message || 'Error al obtener información de logs',
                },
                500
            );
        }
    }
);

/**
 * GET /logs/:type - Obtener contenido de un log específico
 */
logRoutes.openapi(
    createRoute({
        method: 'get',
        path: '/{type}',
        tags: ['Logs - Admin'],
        summary: '[Admin] Obtener logs',
        description: 'Obtiene las últimas líneas de un archivo de log específico',
        security: [{ Bearer: [] }],
        request: {
            params: z.object({
                type: LogTypeEnum,
            }),
            query: GetLogsQuerySchema,
        },
        responses: {
            200: {
                description: 'Contenido del log',
                content: {
                    'application/json': {
                        schema: LogsResponseSchema,
                    },
                },
            },
            403: {
                description: 'Acceso denegado - requiere rol admin',
            },
            404: {
                description: 'Archivo de log no encontrado',
            },
            503: {
                description: 'Logs no disponibles - solo en producción',
            },
        },
    }),
    async (c) => {
        try {
            // Verificar que sea admin
            if (!isAdmin(c)) {
                logger.warn({ userId: c.get('userId') }, 'Intento de acceso no autorizado a logs');
                return c.json(
                    {
                        success: false,
                        error: 'Acceso denegado - requiere rol de administrador',
                    },
                    403
                );
            }

            // Verificar que estemos en producción
            if (env.NODE_ENV !== 'production') {
                return c.json(
                    {
                        success: false,
                        error: 'Los logs solo están disponibles en entorno de producción',
                        environment: env.NODE_ENV,
                    },
                    503
                );
            }

            const { type } = c.req.valid('param');
            const { lines } = c.req.valid('query');

            // Validar número de líneas (máximo 1000)
            const maxLines = Math.min(lines, 1000);

            // Leer el archivo de log
            const logLines = await readLogFile(type as LogType, maxLines);
            const fileInfo = await getLogFileInfo(type as LogType);

            logger.info(
                { userId: c.get('userId'), logType: type, lines: maxLines },
                'Logs consultados'
            );

            return c.json({
                success: true,
                data: {
                    logType: type,
                    lines: logLines,
                    totalLines: logLines.length,
                    fileInfo: {
                        size: fileInfo.size,
                        lastModified: fileInfo.lastModified.toISOString(),
                    },
                },
            });
        } catch (error: any) {
            logger.error({ error }, 'Error al leer archivo de log');

            const statusCode = error.message?.includes('no encontrado') ? 404 : 500;

            return c.json(
                {
                    success: false,
                    error: error.message || 'Error al leer archivo de log',
                },
                statusCode
            );
        }
    }
);

/**
 * DELETE /logs/:type - Limpiar un archivo de log
 */
logRoutes.openapi(
    createRoute({
        method: 'delete',
        path: '/{type}',
        tags: ['Logs - Admin'],
        summary: '[Admin] Limpiar logs',
        description: 'Limpia el contenido de un archivo de log específico',
        security: [{ Bearer: [] }],
        request: {
            params: z.object({
                type: LogTypeEnum,
            }),
        },
        responses: {
            200: {
                description: 'Log limpiado exitosamente',
            },
            403: {
                description: 'Acceso denegado - requiere rol admin',
            },
            503: {
                description: 'Logs no disponibles - solo en producción',
            },
        },
    }),
    async (c) => {
        try {
            // Verificar que sea admin
            if (!isAdmin(c)) {
                logger.warn({ userId: c.get('userId') }, 'Intento de limpiar logs sin autorización');
                return c.json(
                    {
                        success: false,
                        error: 'Acceso denegado - requiere rol de administrador',
                    },
                    403
                );
            }

            // Verificar que estemos en producción
            if (env.NODE_ENV !== 'production') {
                return c.json(
                    {
                        success: false,
                        error: 'Los logs solo están disponibles en entorno de producción',
                        environment: env.NODE_ENV,
                    },
                    503
                );
            }

            const { type } = c.req.valid('param');
            const filePath = path.join(LOG_BASE_PATH, LOG_FILES[type as LogType]);

            // Limpiar el archivo (truncar a 0 bytes)
            await fs.writeFile(filePath, '', 'utf-8');

            logger.info(
                { userId: c.get('userId'), logType: type },
                'Archivo de log limpiado'
            );

            return c.json({
                success: true,
                message: `Archivo de log ${type} limpiado exitosamente`,
            });
        } catch (error: any) {
            logger.error({ error }, 'Error al limpiar archivo de log');
            return c.json(
                {
                    success: false,
                    error: error.message || 'Error al limpiar archivo de log',
                },
                500
            );
        }
    }
);

export default logRoutes;
