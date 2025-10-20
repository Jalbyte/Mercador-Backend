import { Hono } from 'hono';
import { authMiddleware } from '../middlewares/auth.js';
import { cookieToAuthHeader } from '../middlewares/cookieToAuthHeader.js';
import * as paymentService from '../services/payment.service.js';
import * as orderService from '../services/order.service.js';
import * as cartService from '../services/cart.service.js';
import { supabase } from '../config/supabase.js';
import type { CreatePaymentRequest, PaymentNotification } from '../types/payment.types.js';

const payment = new Hono();

// Helper: Extrae token desde Authorization header
function getTokenFromRequest(c: any): string | undefined {
  const authHeader = c.req.header('Authorization')
  return authHeader ? authHeader.replace('Bearer ', '') : undefined
}

// Aplicar middlewares globales (excepto webhook)
payment.use('/create', cookieToAuthHeader)
payment.use('/create', authMiddleware)
payment.use('/status/:paymentId', cookieToAuthHeader)
payment.use('/status/:paymentId', authMiddleware)
payment.use('/order/:orderId', cookieToAuthHeader)
payment.use('/order/:orderId', authMiddleware)

/**
 * POST /api/payments/create
 * Crea una preferencia de pago desde el carrito del usuario
 */
payment.post('/create', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({ error: 'Usuario no autenticado' }, 401);
    }
    
    // Extraer token para operaciones autenticadas
    const token = getTokenFromRequest(c);
    
    const body = await c.req.json<{
      payer?: CreatePaymentRequest['payer'];
      shipping_address?: any;
    }>();

    // Obtener el carrito del usuario (con token)
    const cart = await cartService.getUserCart(userId, token);

    if (!cart.items || cart.items.length === 0) {
      return c.json({ error: 'El carrito está vacío' }, 400);
    }

    // Extraer IDs de productos del carrito
    const productIds = cart.items.map(item => item.product_id);
    const products = await orderService.getProductsByIds(productIds);

    // Verificar stock
    const stockCheck = await orderService.verifyProductsStock(
      cart.items.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity,
      }))
    );

    if (!stockCheck.valid) {
      return c.json({ error: stockCheck.message }, 400);
    }

    // Crear orden en estado 'pending' (con token)
    const order = await orderService.createOrder(userId, {
      shippingAddress: body.shipping_address || {},
      paymentMethod: 'mercadopago',
    }, token);

    // Obtener información del usuario para el pago
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .single();

    const payerInfo = body.payer || {
      email: profile?.email || '',
      name: profile?.full_name?.split(' ')[0] || '',
      surname: profile?.full_name?.split(' ').slice(1).join(' ') || '',
    };

    // Crear preferencia en Mercado Pago
    const preference = await paymentService.createPaymentPreference(
      products,
      payerInfo,
      order.id
    );

    // Determinar la URL correcta según el entorno
    const checkoutUrl = paymentService.IS_SANDBOX 
      ? preference.sandbox_init_point 
      : preference.init_point;

    console.log('💳 Payment preference ready:', {
      mode: paymentService.IS_SANDBOX ? '🧪 SANDBOX' : '🚀 PRODUCTION',
      preference_id: preference.id,
      checkout_url: checkoutUrl,
      url_type: paymentService.IS_SANDBOX ? 'sandbox_init_point' : 'init_point',
    });

    // Verificación de seguridad
    if (paymentService.IS_SANDBOX && checkoutUrl && !checkoutUrl.includes('sandbox')) {
      console.error('🚨 CRITICAL ERROR: Using production URL in sandbox mode!');
      console.error('URL:', checkoutUrl);
      return c.json({ 
        error: 'Configuración incorrecta: URL de producción en modo sandbox',
        details: 'El sistema está configurado en modo sandbox pero la URL generada es de producción'
      }, 500);
    }

    return c.json({
      preference_id: preference.id,
      init_point: checkoutUrl, // URL correcta según el entorno
      sandbox_init_point: preference.sandbox_init_point, // Por compatibilidad
      order_id: order.id,
      mode: paymentService.IS_SANDBOX ? 'sandbox' : 'production',
    });
  } catch (error) {
    console.error('❌ Error creating payment preference:', error);
    return c.json({ 
      error: 'Error al crear preferencia de pago',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

/**
 * POST /api/payments/webhook
 * Webhook para notificaciones de Mercado Pago
 * IMPORTANTE: Esta ruta NO debe tener authMiddleware
 */
payment.post('/webhook', async (c) => {
  try {
    const notification: PaymentNotification = await c.req.json();
    
    console.log('📩 Webhook recibido de Mercado Pago:', {
      type: notification.type,
      action: notification.action,
      data: notification.data,
    });

    // Solo procesar notificaciones de pago
    if (notification.type !== 'payment') {
      console.log('ℹ️ Notificación ignorada (no es de tipo payment)');
      return c.json({ status: 'ignored' });
    }

    const paymentId = notification.data.id;
    
    // Obtener información del pago desde Mercado Pago
    const paymentInfo = await paymentService.verifyPayment(paymentId);
    
    console.log('💳 Información del pago:', paymentInfo);

    const orderId = paymentInfo.external_reference;

    if (!orderId) {
      console.error('❌ No se encontró external_reference en el pago');
      return c.json({ error: 'No order reference found' }, 400);
    }

    // Obtener el user_id de la orden
    const userId = await orderService.getOrderUserId(orderId);

    if (!userId) {
      console.error('❌ No se encontró el usuario de la orden:', orderId);
      return c.json({ error: 'Order not found' }, 404);
    }

    // Procesar según el estado del pago
    if (paymentInfo.approved) {
      console.log('✅ Pago aprobado - Procesando orden');
      
      // Actualizar orden a confirmada
      await orderService.updateOrderStatusWithPayment(
        orderId,
        'confirmed',
        String(paymentInfo.id)
      );
      
      // Asignar license keys al usuario
      await paymentService.assignLicenseKeys(orderId, userId);
      
      console.log(`✅ Orden ${orderId} confirmada y keys asignadas`);
      
    } else if (paymentInfo.status === 'rejected') {
      console.log('❌ Pago rechazado');
      
      await orderService.updateOrderStatusWithPayment(
        orderId,
        'cancelled',
        String(paymentInfo.id)
      );
      
    } else if (paymentInfo.status === 'pending') {
      console.log('⏳ Pago pendiente');
      
      await orderService.updateOrderStatusWithPayment(
        orderId,
        'pending',
        String(paymentInfo.id)
      );
    }

    return c.json({ status: 'processed' });
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    return c.json({ 
      error: 'Error al procesar webhook',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

/**
 * GET /api/payments/status/:paymentId
 * Verifica el estado de un pago específico
 */
payment.get('/status/:paymentId', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({ error: 'Usuario no autenticado' }, 401);
    }
    const paymentId = c.req.param('paymentId');
    
    const paymentInfo = await paymentService.verifyPayment(paymentId);
    
    return c.json(paymentInfo);
  } catch (error) {
    console.error('❌ Error checking payment status:', error);
    return c.json({ 
      error: 'Error al verificar estado del pago',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

/**
 * GET /api/payments/order/:orderId
 * Obtiene el estado de una orden con sus items
 */
payment.get('/order/:orderId', async (c) => {
  try {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({ error: 'Usuario no autenticado' }, 401);
    }
    
    // Extraer token para operaciones autenticadas
    const token = getTokenFromRequest(c);
    const orderId = c.req.param('orderId');
    
    const order = await orderService.getOrderById(userId, orderId, token);
    
    if (!order) {
      return c.json({ error: 'Orden no encontrada' }, 404);
    }
    
    return c.json(order);
  } catch (error) {
    console.error('❌ Error fetching order:', error);
    return c.json({ 
      error: 'Error al obtener orden',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

export default payment;