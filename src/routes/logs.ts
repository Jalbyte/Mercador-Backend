/**
 * Rutas de gestión de logs del sistema
 *
 * Este módulo proporciona endpoints para acceder a los logs de la aplicación
 * en producción. Solo accesible para administradores.
 *
 * Funcionalidades implementadas:
 * - ✅ Obtener logs de error (busca el archivo más reciente que empieza con 'error')
 * - ✅ Obtener logs de salida (busca el archivo más reciente que empieza con 'output')
 * - ✅ Obtener logs combinados (busca el archivo más reciente que empieza con 'combined')
 * - ✅ Solo disponible en producción
 * - ✅ Solo accesible para administradores
 *
 * @module routes/logs
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
    return role === 'admin';
}

// Configuración de rutas de logs
const LOG_BASE_PATH = '/home/ec2-user/mercador/logs';

// Los nombres clave que se buscarán
const LogTypeEnum = z.enum(['error', 'output', 'combined']);
type LogType = z.infer<typeof LogTypeEnum>;

/**
 * BUSCA el archivo de log más reciente en LOG_BASE_PATH
 * que comienza con el prefijo especificado (ej: 'error', 'output').
 */
async function findLogFile(logType: LogType): Promise<string> {
    try {
        // 1. Leer todos los archivos en el directorio de logs
        const files = await fs.readdir(LOG_BASE_PATH);

        // 2. Filtrar por el prefijo (ej: error-11.log, output-11.log)
        // PM2 usa el patrón: [nombre_de_la_app]-[id]-[logType].log, o solo [logType]-[id].log
        const logPrefix = logType;

        const matchingFiles = files.filter(file =>
            file.includes(logPrefix) && file.endsWith('.log') && !file.includes('__')
        );

        if (matchingFiles.length === 0) {
            throw new Error(`Archivos de log para '${logType}' no encontrados.`);
        }

        // 3. Encontrar el archivo más reciente (basado en el timestamp de modificación)
        let latestFile = '';
        let latestMtimeMs = 0;

        for (const file of matchingFiles) {
            const filePath = path.join(LOG_BASE_PATH, file);
            const stats = await fs.stat(filePath);

            if (stats.mtimeMs > latestMtimeMs) {
                latestMtimeMs = stats.mtimeMs;
                latestFile = filePath;
            }
        }

        if (!latestFile) {
            throw new Error(`No se pudo determinar el archivo más reciente para '${logType}'.`);
        }

        return latestFile;

    } catch (error) {
        if ((error as any).code === 'ENOENT') {
            throw new Error(`Directorio de logs no encontrado: ${LOG_BASE_PATH}`);
        }
        throw error;
    }
}


/**
 * Lee un archivo de log encontrado dinámicamente y retorna las últimas N líneas
 */
async function readLogFile(logType: LogType, lines: number = 100): Promise<string[]> {
    const filePath = await findLogFile(logType);

    try {
        const content = await fs.readFile(filePath, 'utf-8');
        const allLines = content.split('\n').filter(line => line.trim() !== '');

        // Retornar las últimas N líneas
        return allLines.slice(-lines);
    } catch (error) {
        // En este punto, el error más probable es de lectura/permisos
        throw new Error(`Error al leer archivo ${path.basename(filePath)}: ${(error as Error).message}`);
    }
}

/**
 * Obtiene información del tamaño de un archivo de log encontrado dinámicamente
 */
async function getLogFileInfo(logType: LogType): Promise<{ size: number; lastModified: Date; filePath: string }> {
    try {
        const filePath = await findLogFile(logType);
        const stats = await fs.stat(filePath);

        return {
            size: stats.size,
            lastModified: stats.mtime,
            filePath: filePath,
        };
    } catch (error) {
        // Aquí capturamos el error de findLogFile si no encuentra el archivo
        if (error instanceof Error && error.message.includes('no encontrados')) {
            return {
                size: 0,
                lastModified: new Date(0),
                filePath: path.join(LOG_BASE_PATH, `${logType}-...log`) // Usar un path de ejemplo para referencia
            };
        }
        throw error;
    }
}

// ==================
// SCHEMAS (Se mantiene igual, solo se usa el nuevo LogTypeEnum)
// ==================

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
            path: z.string(), // Se añade la ruta para claridad
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
            // ... (isAdmin y NODE_ENV check se mantienen iguales)
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

            // Obtener información de todos los archivos de log dinámicamente
            const logTypes: LogType[] = LogTypeEnum.options;

            const filesInfo = await Promise.all(
                logTypes.map(async (logType) => {
                    try {
                        const info = await getLogFileInfo(logType);
                        return {
                            type: logType,
                            path: info.filePath,
                            size: info.size,
                            lastModified: info.lastModified.toISOString(),
                            exists: info.size > 0,
                        };
                    } catch (error) {
                        // Esto captura errores si el directorio existe pero la lógica falla (menos probable)
                        return {
                            type: logType,
                            path: path.join(LOG_BASE_PATH, `${logType}-<ID>.log`),
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
            // ... (isAdmin y NODE_ENV check se mantienen iguales)
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

            const maxLines = Math.min(lines, 1000);

            // Leer el archivo de log (usa la nueva lógica dinámica)
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
                        path: fileInfo.filePath, // Se añade la ruta
                    },
                },
            });
        } catch (error: any) {
            logger.error({ error }, 'Error al leer archivo de log');

            const statusCode = error.message?.includes('no encontrados') || error.message?.includes('no pudo determinar') ? 404 : 500;

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
        description: 'Limpia el contenido del archivo de log más reciente para ese tipo.',
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
            // ... (isAdmin y NODE_ENV check se mantienen iguales)
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

            // 1. Encontrar la ruta del archivo más reciente
            const filePath = await findLogFile(type as LogType);

            // 2. Limpiar el archivo (truncar a 0 bytes)
            await fs.writeFile(filePath, '', 'utf-8');

            logger.info(
                { userId: c.get('userId'), logType: type, filePath: filePath },
                'Archivo de log limpiado'
            );

            return c.json({
                success: true,
                message: `Archivo de log ${path.basename(filePath)} limpiado exitosamente`,
            });
        } catch (error: any) {
            logger.error({ error }, 'Error al limpiar archivo de log');

            const statusCode = error.message?.includes('no encontrados') ? 404 : 500;

            return c.json(
                {
                    success: false,
                    error: error.message || 'Error al limpiar archivo de log',
                },
                statusCode
            );
        }
    }
);

export default logRoutes;