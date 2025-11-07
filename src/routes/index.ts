/**
 * Índice de rutas de la aplicación Mercador
 *
 * Este módulo centraliza todas las exportaciones de rutas para facilitar
 * su importación y registro en la aplicación principal. Incluye rutas para:
 * - Health checks y monitoreo
 * - Autenticación y gestión de usuarios
 * - Catálogo de productos
 * - Carrito de compras
 * - Órdenes y pedidos
 * - Perfiles de usuario
 *
 * @module routes
 *
 * @example
 * ```typescript
 * import {
 *   healthRoutes,
 *   authRoutes,
 *   productRoutes,
 *   cartRoutes,
 *   orderRoutes,
 *   profileRoutes,
 *   paymentRoutes
 * } from './routes'
 *
 * // Registrar todas las rutas en la aplicación
 * app.route('/health', healthRoutes)
 * app.route('/auth', authRoutes)
 * app.route('/products', productRoutes)
 * app.route('/cart', cartRoutes)
 * app.route('/orders', orderRoutes)
 * app.route('/profile', profileRoutes)
 * app.route('/payments', paymentRoutes)
 *
 * // Estructura de rutas resultante:
 * // /health/* - Health checks
 * // /auth/* - Autenticación
 * // /products/* - Productos
 * // /cart/* - Carrito de compras
 * // /orders/* - Órdenes
 * // /profile/* - Perfiles de usuario
 * // /payments/* - Pagos con Mercado Pago
 * ```
 */

import healthRoutes from './health.js'
import authRoutes from './auth.js'
import productRoutes from './products.js'
import cartRoutes from './cart.js'
import orderRoutes from './orders.js'
import profileRoutes from './profile.js'
// import paymentRoutes from './payments.js' // ⚠️ Mercado Pago deshabilitado
import wompiRoutes from './wompi.js'
import adminUserRoutes from './admin-users.js'
import adminStatsRoutes from './admin-stats.js'
import { returnRoutes } from './returns.js'
import logRoutes from './logs.js'



// Export all route modules
export {
  healthRoutes,
  authRoutes,
  productRoutes,
  cartRoutes,
  orderRoutes,
  profileRoutes,
  // paymentRoutes, // ⚠️ Mercado Pago deshabilitado
  wompiRoutes,
  adminUserRoutes,
  adminStatsRoutes,
  returnRoutes,
  logRoutes
};
