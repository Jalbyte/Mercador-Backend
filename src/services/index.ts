/**
 * Índice de servicios de la aplicación Mercador
 *
 * Este módulo centraliza todas las exportaciones de servicios para facilitar
 * su importación desde otros módulos de la aplicación. Incluye servicios para:
 * - Gestión de usuarios y autenticación
 * - Catálogo de productos
 * - Carrito de compras
 * - Órdenes y pedidos
 * - Claves de producto y licencias
 * - Cache Redis
 * - Administración y estadísticas
 *
 * @module services
 *
 * @example
 * ```typescript
 * import {
 *   userService,
 *   productService,
 *   cartService,
 *   orderService,
 *   adminService
 * } from './services'
 *
 * // Usar servicios en controladores
 * const user = await userService.getUserById(userId)
 * const products = await productService.getAllProducts()
 * const cart = await cartService.getUserCart(userId)
 * const orders = await orderService.getUserOrders(userId)
 * const stats = await adminService.getDashboardStats(adminId)
 *
 * // Servicios disponibles:
 * // - userService: Autenticación, perfiles, gestión de usuarios
 * // - productService: CRUD productos, búsqueda, categorías
 * // - cartService: Carrito de compras, items, totales
 * // - orderService: Órdenes, pagos, estados de pedido
 * // - productKeyService: Licencias, activaciones, expiración
 * // - redisService: Cache, sesiones, rate limiting
 * // - adminService: Estadísticas, métricas, dashboard
 * ```
 */

export * as userService from './user.service.js'
export * as productService from './product.service.js'
export * as cartService from './cart.service.js'
export * as orderService from './order.service.js'
export * as adminService from './admin.service.js'